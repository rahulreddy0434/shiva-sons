export type PageState = 'not_read' | 'removed' | 'read' | 'records' | 'continues' | 'empty'

export interface PageStatus {
  pageNumber: number
  state: PageState
  label: string
  /** Worth a look: nothing was found on an extracted page, or it was never read. */
  attention: boolean
}

/**
 * What happened to each page of one document, for the Documents step.
 * `pages` holds the pages OCR read: whether their text is still there, and
 * how many records start on them.
 */
export function pageStatuses(
  pageCount: number,
  pages: { pageNumber: number; hasText: boolean; recordCount: number }[],
  { extracted, purged }: { extracted: boolean; purged: boolean }
): PageStatus[] {
  const byNumber = new Map(pages.map((p) => [p.pageNumber, p]))
  const total = Math.max(pageCount, ...pages.map((p) => p.pageNumber), 0)
  const result: PageStatus[] = []
  let recordAbove = false

  for (let n = 1; n <= total; n++) {
    const page = byNumber.get(n)
    if (!page) {
      result.push({ pageNumber: n, state: 'not_read', label: 'not read yet', attention: extracted })
      recordAbove = false
      continue
    }
    if (page.recordCount > 0) {
      result.push({
        pageNumber: n,
        state: 'records',
        label: `${page.recordCount} record${page.recordCount === 1 ? '' : 's'}`,
        attention: false,
      })
      recordAbove = true
    } else if (purged || !page.hasText) {
      result.push({ pageNumber: n, state: 'removed', label: 'original removed', attention: false })
    } else if (!extracted) {
      result.push({ pageNumber: n, state: 'read', label: 'read', attention: false })
    } else if (recordAbove) {
      // A card that runs over several pages is one record, kept on its first page
      result.push({ pageNumber: n, state: 'continues', label: 'part of the card before', attention: false })
    } else {
      result.push({ pageNumber: n, state: 'empty', label: 'nothing found', attention: true })
    }
  }
  return result
}

/** Page numbers as short ranges: [1, 2, 3, 5, 7, 8] → "1–3, 5, 7–8". */
export function pageRanges(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]
    while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i++
    parts.push(start === sorted[i] ? String(start) : `${start}–${sorted[i]}`)
  }
  return parts.join(', ')
}

export interface PageGroup {
  state: PageState
  /** "Pages 1–3, 5" or "Page 4" */
  pages: string
  count: number
  label: string
  attention: boolean
}

const GROUP_LABEL: Record<PageState, string> = {
  records: 'records found',
  continues: 'part of the card on the page before',
  read: 'read',
  not_read: 'not read yet',
  removed: 'original removed',
  empty: 'nothing found',
}

/**
 * The same page statuses folded into one line per kind, so a 200-page
 * document reads as a few lines instead of 200 labels. Problems come first.
 */
export function groupPageStatuses(statuses: PageStatus[]): PageGroup[] {
  const order: PageState[] = ['empty', 'not_read', 'records', 'continues', 'read', 'removed']
  return order.flatMap((state) => {
    const pages = statuses.filter((s) => s.state === state)
    if (pages.length === 0) return []
    const numbers = pages.map((p) => p.pageNumber)
    return [
      {
        state,
        pages: `${numbers.length === 1 ? 'Page' : 'Pages'} ${pageRanges(numbers)}`,
        count: pages.length,
        label: GROUP_LABEL[state],
        attention: pages.some((p) => p.attention),
      },
    ]
  })
}
