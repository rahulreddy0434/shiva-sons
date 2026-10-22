import type { Box } from '@/lib/azure/document-intelligence'
import type { ExtractionField } from '@/types/extraction'
import { groupFields } from '@/lib/review/group-fields'
import { locateSource, type LocateRequest, type LocatorPage } from '@/lib/review/source-locator'

/** Below this Azure was unsure it read the writing right; Review asks for a check. */
export const HARD_TO_READ_THRESHOLD = 0.6

function contains([left, top, width, height]: Box, [x, y]: [number, number]): boolean {
  return x >= left && x <= left + width && y >= top && y <= top + height
}

const centre = ([left, top, width, height]: Box): [number, number] => [left + width / 2, top + height / 2]

/**
 * How sure the OCR was about the writing a value came from: the least sure
 * word where the value was found on the page (its table cell, or the words
 * that spell it). Null when the value cannot be placed on the page, or the
 * page was read before word confidence was kept, so an unknown never
 * counts as a doubt.
 */
export function readConfidence(request: LocateRequest): number | null {
  const location = locateSource(request)
  // A whole row is too wide to say anything about one value
  if (!location || location.match === 'row') return null
  const page = request.pages.find((p) => p.pageNumber === location.pageNumber)
  if (!page) return null

  const scores = page.words
    // A dash or tick for a day off scores low but says nothing about the writing
    .filter((w) => typeof w.confidence === 'number' && /[\p{L}\p{N}]/u.test(w.text))
    .filter((w) => location.boxes.some((box) => contains(box, centre(w.box))))
    .map((w) => w.confidence as number)
  return scores.length > 0 ? Math.round(Math.min(...scores) * 1000) / 1000 : null
}

/**
 * readConfidence for every value of one record. `pages` are the record's own
 * pages (see pagesForRecord), so a value is not matched on the next card.
 */
export function recordReadConfidence(
  results: { fieldKey: string; value: string | null }[],
  fields: ExtractionField[],
  pages: LocatorPage[]
): Map<string, number | null> {
  // Day columns (1–31) are found by their cell in the card's table
  const seriesOf = new Map<string, string[]>()
  for (const group of groupFields(fields)) {
    if (group.kind === 'series') for (const f of group.fields) seriesOf.set(f.key, group.fields.map((g) => g.label))
  }
  const labelOf = new Map(fields.map((f) => [f.key, f.label]))
  const found = new Map<string, number | null>()
  for (const result of results) {
    const label = labelOf.get(result.fieldKey)
    found.set(
      result.fieldKey,
      result.value && label ? readConfidence({ label, value: result.value, series: seriesOf.get(result.fieldKey), pages }) : null
    )
  }
  return found
}
