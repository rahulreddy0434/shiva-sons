import { describe, expect, it } from 'vitest'
import { groupPageStatuses, pageRanges, pageStatuses } from './page-status'

const page = (pageNumber: number, recordCount = 0, hasText = true) => ({ pageNumber, hasText, recordCount })

describe('pageStatuses', () => {
  it('shows pages that are read but not yet extracted', () => {
    expect(pageStatuses(2, [page(1), page(2)], { extracted: false, purged: false }).map((p) => p.label)).toEqual([
      'read',
      'read',
    ])
  })

  it('marks pages the reader has not reached yet', () => {
    expect(pageStatuses(3, [page(1)], { extracted: false, purged: false }).map((p) => [p.label, p.attention])).toEqual([
      ['read', false],
      ['not read yet', false],
      ['not read yet', false],
    ])
  })

  it('tells record pages, continuation pages and empty pages apart after extraction', () => {
    const statuses = pageStatuses(5, [page(1, 1), page(2), page(3, 2), page(4), page(5)], {
      extracted: true,
      purged: false,
    })
    expect(statuses.map((p) => [p.label, p.attention])).toEqual([
      ['1 record', false],
      ['part of the card before', false],
      ['2 records', false],
      ['part of the card before', false],
      ['part of the card before', false],
    ])
  })

  it('flags an extracted page where nothing was found', () => {
    const statuses = pageStatuses(2, [page(1), page(2, 1)], { extracted: true, purged: false })
    expect(statuses[0]).toMatchObject({ state: 'empty', label: 'nothing found', attention: true })
  })

  it('says when the original has been removed', () => {
    expect(pageStatuses(1, [page(1, 0, false)], { extracted: true, purged: true })[0].label).toBe('original removed')
    // Records made before removal are still counted
    expect(pageStatuses(1, [page(1, 1, false)], { extracted: true, purged: true })[0].label).toBe('1 record')
  })
})

describe('pageRanges', () => {
  it('folds runs of pages into ranges', () => {
    expect(pageRanges([1, 2, 3, 5, 7, 8])).toBe('1–3, 5, 7–8')
    expect(pageRanges([4])).toBe('4')
    expect(pageRanges([])).toBe('')
  })
})

describe('groupPageStatuses', () => {
  it('reads a 200-page document as a few lines, problems first', () => {
    const read = Array.from({ length: 198 }, (_, i) => page(i + 1, i % 2 === 0 ? 1 : 0))
    const groups = groupPageStatuses(pageStatuses(200, read, { extracted: true, purged: false }))
    expect(groups.map((g) => [g.pages, g.label, g.attention])).toEqual([
      ['Pages 199–200', 'not read yet', true],
      [`Pages ${Array.from({ length: 99 }, (_, i) => i * 2 + 1).join(', ')}`, 'records found', false],
      [`Pages ${Array.from({ length: 99 }, (_, i) => i * 2 + 2).join(', ')}`, 'part of the card on the page before', false],
    ])
  })

  it('says Page for a single page', () => {
    expect(groupPageStatuses(pageStatuses(1, [page(1, 1)], { extracted: true, purged: false }))).toMatchObject([
      { pages: 'Page 1', label: 'records found', count: 1 },
    ])
  })
})
