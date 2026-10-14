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
