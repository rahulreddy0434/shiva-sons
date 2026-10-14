import type { Box, NormalizedTable, NormalizedWord } from '@/lib/azure/document-intelligence'

/** What OCR found on one page, with positions. */
export interface LocatorPage {
  pageNumber: number
  words: NormalizedWord[]
  tables: Pick<NormalizedTable, 'rows' | 'boxes'>[]
}

export interface SourceLocation {
  pageNumber: number
  boxes: Box[]
  /**
   * cell: the table cell holding the value. row: the row for that day, when
   * the value itself could not be matched to one cell. text: words on the page.
   */
  match: 'cell' | 'row' | 'text'
}

export interface LocateRequest {
  label: string
  value: string
  /** Labels of the run this field belongs to (for example "1" … "31"), if any. */
  series?: string[]
  /** Pages to search, most likely first: the record's own pages. */
  pages: LocatorPage[]
}

/** Lower-case, single-spaced, without the punctuation that clings to words ("No:", "4417,"). */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s.,:;()[\]"'“”‘’#*-]+|[\s.,:;()[\]"'“”‘’#*]+$/g, '')
}

function sameValue(a: string, b: string): boolean {
  const x = normalize(a)
  const y = normalize(b)
  if (x === '' || y === '') return false
  if (x === y) return true
  const nx = Number(x)
  const ny = Number(y)
  return x !== '' && y !== '' && Number.isFinite(nx) && Number.isFinite(ny) && nx === ny
}

/** Cells that mean "nothing worked" on a time card, which the extraction records as 0. */
const BLANK_DAY = /^(|s|a|x|-|–|off|abs|absent|leave|l|h|wo|w\/o|sun|sunday|holiday)$/

const round = (n: number) => Math.round(n * 10000) / 10000

function union(boxes: Box[]): Box {
  const left = Math.min(...boxes.map((b) => b[0]))
  const top = Math.min(...boxes.map((b) => b[1]))
  const right = Math.max(...boxes.map((b) => b[0] + b[2]))
  const bottom = Math.max(...boxes.map((b) => b[1] + b[3]))
  return [round(left), round(top), round(right - left), round(bottom - top)]
}

function centre(box: Box): [number, number] {
  return [box[0] + box[2] / 2, box[1] + box[3] / 2]
}

function distance(a: Box, b: Box): number {
  const [ax, ay] = centre(a)
  const [bx, by] = centre(b)
  return Math.hypot(ax - bx, ay - by)
}

/** Every run of consecutive words that reads as the given text, as one box each. */
function findPhrase(words: NormalizedWord[], text: string): Box[] {
  const target = normalize(text)
  if (target === '') return []
  const targetWords = target.split(' ')
  const found: Box[] = []

  for (let start = 0; start < words.length; start++) {
    const parts: string[] = []
    for (let end = start; end < words.length && parts.length < targetWords.length + 2; end++) {
      parts.push(normalize(words[end].text))
      const joined = parts.filter(Boolean).join(' ')
      if (joined === target || (parts.length === 1 && sameValue(words[end].text, text))) {
        found.push(union(words.slice(start, end + 1).map((w) => w.box)))
        break
      }
      if (!target.startsWith(joined)) break
    }
  }
  return found
}

/**
 * A run of day (or week, or weekday) cells in a table. Two layouts are
 * understood: one row per day with the day in the first column, and one
 * column per day under a heading row.
 */
function locateInSeries(label: string, value: string, series: string[], page: LocatorPage): SourceLocation | null {
  const isSeriesLabel = (text: string) => series.some((s) => sameValue(s, text))
  const valueIsZero = sameValue(value, '0')

  for (const table of page.tables) {
    const boxes = table.boxes
    if (!boxes) continue

    // One row per day
    const firstColumn = table.rows.map((row) => row[0] ?? '')
    if (firstColumn.filter(isSeriesLabel).length >= 3) {
      const r = firstColumn.findIndex((text) => sameValue(text, label))
      if (r !== -1) {
        const row = table.rows[r]
        for (let c = 1; c < row.length; c++) {
          const box = boxes[r]?.[c]
          if (!box) continue
          if (sameValue(row[c], value) || (valueIsZero && BLANK_DAY.test(normalize(row[c])))) {
            return { pageNumber: page.pageNumber, boxes: [box], match: 'cell' }
          }
        }
        const rowBoxes = (boxes[r] ?? []).filter((b): b is Box => b !== null)
        if (rowBoxes.length) return { pageNumber: page.pageNumber, boxes: [union(rowBoxes)], match: 'row' }
      }
    }

    // One column per day, under a heading row
    for (let r = 0; r < table.rows.length; r++) {
      const row = table.rows[r]
      if (row.filter(isSeriesLabel).length < 3) continue
      const c = row.findIndex((text) => sameValue(text, label))
      if (c === -1) continue
      for (let below = r + 1; below < table.rows.length; below++) {
        const box = boxes[below]?.[c]
        const text = table.rows[below][c] ?? ''
        if (box && (sameValue(text, value) || (valueIsZero && BLANK_DAY.test(normalize(text))))) {
          return { pageNumber: page.pageNumber, boxes: [box], match: 'cell' }
        }
      }
      const columnBoxes = table.rows.slice(r).map((_, i) => boxes[r + i]?.[c]).filter((b): b is Box => !!b)
      if (columnBoxes.length) return { pageNumber: page.pageNumber, boxes: [union(columnBoxes)], match: 'row' }
    }
  }
  return null
}

/**
 * Where on the original document a value most likely came from, or null if
 * it cannot be found. It only points at text that is really on the page —
 * when in doubt it returns null rather than guess.
 */
export function locateSource({ label, value, series, pages }: LocateRequest): SourceLocation | null {
  if (normalize(value) === '') return null

  if (series && series.length >= 3) {
    for (const page of pages) {
      const found = locateInSeries(label, value, series, page)
      if (found) return found
    }
    return null
  }

  // A single value: the matching words, nearest to the field's own label
  // when the same text appears more than once
  for (const page of pages) {
    const candidates = findPhrase(page.words, value)
    if (candidates.length === 0) continue
    if (candidates.length === 1) return { pageNumber: page.pageNumber, boxes: candidates, match: 'text' }

    const labels = findPhrase(page.words, label)
    if (labels.length === 0) {
      // Several places, nothing to choose between them by: do not guess
      return null
    }
    let best = candidates[0]
    let bestDistance = Infinity
    for (const candidate of candidates) {
      for (const labelBox of labels) {
        const d = distance(candidate, labelBox)
        if (d < bestDistance) {
          bestDistance = d
          best = candidate
        }
      }
    }
    return { pageNumber: page.pageNumber, boxes: [best], match: 'text' }
  }
  return null
}

/**
 * The pages a record can have come from: the page it starts on and the ones
 * after it, up to the page where the next record in the document starts. A
 * card that runs over two pages is searched on both; the next card is not.
 */
export function pagesForRecord(pageNumbers: number[], start: number, otherStarts: number[]): number[] {
  const nextStart = Math.min(...otherStarts.filter((p) => p > start), Infinity)
  return pageNumbers.filter((p) => p >= start && p < nextStart).sort((a, b) => a - b)
}
