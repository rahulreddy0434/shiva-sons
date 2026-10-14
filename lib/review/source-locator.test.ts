import { describe, expect, it } from 'vitest'
import type { Box } from '@/lib/azure/document-intelligence'
import { locateSource, normalize, pagesForRecord, type LocatorPage } from './source-locator'

const r4 = (n: number) => Math.round(n * 10000) / 10000

// Words laid out on a line: each 0.05 wide, starting at x, on row y
function line(text: string, x: number, y: number) {
  return text.split(' ').map((t, i) => ({ text: t, box: [r4(x + i * 0.06), y, 0.05, 0.02] as Box }))
}

// A Day | Hours table, one row per day, rows 0.03 apart from y = 0.2
function dayTable(hours: string[]) {
  const rows = [['Day', 'Hours'], ...hours.map((h, i) => [String(i + 1), h])]
  const boxes = rows.map((_, r) => [[0.1, r4(0.2 + r * 0.03), 0.1, 0.03], [0.2, r4(0.2 + r * 0.03), 0.1, 0.03]] as Box[])
  return { rows, boxes }
}

const days = Array.from({ length: 31 }, (_, i) => String(i + 1))

const page1: LocatorPage = {
  pageNumber: 1,
  words: [...line('Card No: 4417', 0.1, 0.05), ...line('Name: Meera Fakename', 0.4, 0.05), ...line('Company: Northwind Labour', 0.1, 0.08)],
  tables: [dayTable(['8', '8', 'S', '9', '8'])],
}

describe('normalize', () => {
  it('ignores case, spacing and clinging punctuation', () => {
    expect(normalize('  Card   No: ')).toBe('card no')
    expect(normalize('(4417),')).toBe('4417')
  })
})

describe('locateSource — single values', () => {
  it('finds a value by its words', () => {
    expect(locateSource({ label: 'Card No', value: '4417', pages: [page1] })).toEqual({
      pageNumber: 1,
      boxes: [[0.22, 0.05, 0.05, 0.02]],
      match: 'text',
    })
  })

  it('finds a value spread over several words as one box', () => {
    const found = locateSource({ label: 'Name', value: 'Meera Fakename', pages: [page1] })!
    expect(found.boxes).toHaveLength(1)
    expect(found.boxes[0][0]).toBeCloseTo(0.46)
    expect(found.boxes[0][2]).toBeCloseTo(0.11)
  })

  it('does not care about case or trailing punctuation', () => {
    expect(locateSource({ label: 'Company', value: 'northwind labour', pages: [page1] })).not.toBeNull()
  })

  it('picks the occurrence nearest its label when the text appears twice', () => {
    const page: LocatorPage = {
      pageNumber: 1,
      words: [...line('Site: 221', 0.1, 0.1), ...line('Total 221', 0.1, 0.9)],
      tables: [],
    }
    const found = locateSource({ label: 'Total', value: '221', pages: [page] })!
    expect(found.boxes[0][1]).toBe(0.9)
  })

  it('does not guess between repeats when its label is not on the page', () => {
    const page: LocatorPage = { pageNumber: 1, words: [...line('221', 0.1, 0.1), ...line('221', 0.1, 0.5)], tables: [] }
    expect(locateSource({ label: 'Total', value: '221', pages: [page] })).toBeNull()
  })

  it('searches later pages of the record when the first does not have it', () => {
    const page2: LocatorPage = { pageNumber: 2, words: line('Total 231', 0.1, 0.9), tables: [] }
    expect(locateSource({ label: 'Total', value: '231', pages: [page1, page2] })?.pageNumber).toBe(2)
  })

  it('treats 8.0 and 8 as the same number', () => {
    const page: LocatorPage = { pageNumber: 1, words: line('Rate 8.0', 0.1, 0.1), tables: [] }
    expect(locateSource({ label: 'Rate', value: '8', pages: [page] })).not.toBeNull()
  })

  it('returns null for an empty value or one that is not on the page', () => {
    expect(locateSource({ label: 'Card No', value: '', pages: [page1] })).toBeNull()
    expect(locateSource({ label: 'Name', value: 'Someone Else', pages: [page1] })).toBeNull()
  })

  it('returns null for a page read before positions were kept', () => {
    expect(locateSource({ label: 'Card No', value: '4417', pages: [{ pageNumber: 1, words: [], tables: [] }] })).toBeNull()
  })
})

describe('locateSource — days in a table', () => {
  it('points at the hours cell in that day’s row', () => {
    expect(locateSource({ label: '4', value: '9', series: days, pages: [page1] })).toEqual({
      pageNumber: 1,
      boxes: [[0.2, 0.32, 0.1, 0.03]],
      match: 'cell',
    })
  })

  it('points at an S or blank cell for a day recorded as 0', () => {
    expect(locateSource({ label: '3', value: '0', series: days, pages: [page1] })).toMatchObject({
      boxes: [[0.2, 0.29, 0.1, 0.03]],
      match: 'cell',
    })
  })

  it('falls back to the whole row when the value does not match the card', () => {
    // The card says 8 for day 1; a corrected 7.5 is not on it
    expect(locateSource({ label: '1', value: '7.5', series: days, pages: [page1] })).toMatchObject({
      boxes: [[0.1, 0.23, 0.2, 0.03]],
      match: 'row',
    })
  })

  it('finds days on the second page of a two-page card', () => {
    const rows = [['Day', 'Hours'], ['16', '8'], ['17', '9'], ['18', '8']]
    const boxes = rows.map((_, r) => [[0.1, 0.2 + r * 0.03, 0.1, 0.03], [0.2, 0.2 + r * 0.03, 0.1, 0.03]] as Box[])
    const page2: LocatorPage = { pageNumber: 2, words: [], tables: [{ rows, boxes }] }
    expect(locateSource({ label: '17', value: '9', series: days, pages: [page1, page2] })).toMatchObject({
      pageNumber: 2,
      match: 'cell',
    })
  })

  it('understands one column per day under a heading row', () => {
    const rows = [['Name', '1', '2', '3', '4'], ['Asha', '8', '0', '9', '8']]
    const boxes = rows.map((row, r) => row.map((_, c) => [r4(c * 0.1), r4(0.5 + r * 0.05), 0.1, 0.05] as Box))
    const page: LocatorPage = { pageNumber: 1, words: [], tables: [{ rows, boxes }] }
    expect(locateSource({ label: '3', value: '9', series: days, pages: [page] })).toEqual({
      pageNumber: 1,
      boxes: [[0.3, 0.55, 0.1, 0.05]],
      match: 'cell',
    })
  })

  it('does not take a lone "1" in some other table for day 1', () => {
    const page: LocatorPage = { pageNumber: 1, words: [], tables: [{ rows: [['1', '8']], boxes: [[[0, 0, 0.1, 0.1], [0.1, 0, 0.1, 0.1]]] }] }
    expect(locateSource({ label: '1', value: '8', series: days, pages: [page] })).toBeNull()
  })

  it('returns null when no table on the record’s pages has the day', () => {
    expect(locateSource({ label: '20', value: '8', series: days, pages: [page1] })).toBeNull()
  })
})

describe('pagesForRecord', () => {
  it('runs from the record’s page up to where the next record starts', () => {
    expect(pagesForRecord([1, 2, 3, 4], 1, [3])).toEqual([1, 2])
    expect(pagesForRecord([1, 2, 3, 4], 3, [1])).toEqual([3, 4])
  })

  it('keeps the start page when another record starts on the same page', () => {
    expect(pagesForRecord([1, 2], 1, [1, 2])).toEqual([1])
  })
})
