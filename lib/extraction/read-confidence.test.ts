import { describe, expect, it } from 'vitest'
import type { Box } from '@/lib/azure/document-intelligence'
import type { LocatorPage } from '@/lib/review/source-locator'
import { readConfidence, recordReadConfidence } from './read-confidence'

const r4 = (n: number) => Math.round(n * 10000) / 10000
const word = (text: string, x: number, y: number, confidence?: number) => ({
  text,
  box: [x, y, 0.05, 0.02] as Box,
  ...(confidence === undefined ? {} : { confidence }),
})

// Day | Hours table; the hour written on day 3 is faint
const hours = ['8', '8', '6', '9', '8']
const rows = [['Day', 'Hours'], ...hours.map((h, i) => [String(i + 1), h])]
const boxes = rows.map((_, r) => [[0.1, r4(0.2 + r * 0.03), 0.1, 0.03], [0.2, r4(0.2 + r * 0.03), 0.1, 0.03]] as Box[])
const page: LocatorPage = {
  pageNumber: 1,
  words: [
    word('Name:', 0.1, 0.05, 0.99),
    word('Meera', 0.16, 0.05, 0.97),
    word('Fakename', 0.22, 0.05, 0.41),
    ...hours.map((h, i) => word(h, 0.22, r4(0.2 + (i + 1) * 0.03 + 0.005), i === 2 ? 0.35 : 0.95)),
  ],
  tables: [{ rows, boxes }],
}
const days = Array.from({ length: 5 }, (_, i) => String(i + 1))

describe('readConfidence', () => {
  it('takes the least sure word of a value spelled in words', () => {
    expect(readConfidence({ label: 'Name', value: 'Meera Fakename', pages: [page] })).toBe(0.41)
  })

  it('reads a day value from the words inside its table cell', () => {
    expect(readConfidence({ label: '3', value: '6', series: days, pages: [page] })).toBe(0.35)
    expect(readConfidence({ label: '4', value: '9', series: days, pages: [page] })).toBe(0.95)
  })

  it('says nothing when the value is not on the page, or confidence was not kept', () => {
    expect(readConfidence({ label: 'Name', value: 'Someone Else', pages: [page] })).toBeNull()
    const old = { ...page, words: page.words.map(({ text, box }) => ({ text, box })) }
    expect(readConfidence({ label: 'Name', value: 'Meera Fakename', pages: [old] })).toBeNull()
  })
})

describe('recordReadConfidence', () => {
  it('scores each value of a record, finding day columns by their table cell', () => {
    const fields = [
      { key: 'name', label: 'Name', dataType: 'string' as const, required: true, sortOrder: 0 },
      ...days.map((d, i) => ({ key: `day_${d}`, label: d, dataType: 'number' as const, required: false, sortOrder: i + 1 })),
    ]
    const results = [{ fieldKey: 'name', value: 'Meera Fakename' }, ...hours.map((h, i) => ({ fieldKey: `day_${i + 1}`, value: h })), { fieldKey: 'day_9', value: null }]
    const scores = recordReadConfidence(results, fields, [page])
    expect(scores.get('name')).toBe(0.41)
    expect(scores.get('day_3')).toBe(0.35)
    expect(scores.get('day_1')).toBe(0.95)
    expect(scores.get('day_9')).toBeNull()
  })
})

describe('readConfidence and marks', () => {
  it('ignores a dash for a day off, which Azure always scores low', () => {
    const dashPage: LocatorPage = {
      ...page,
      words: [...page.words.filter((w) => w.text !== '9'), word('-', 0.22, r4(0.2 + 4 * 0.03 + 0.005), 0.07)],
      tables: [{ rows: rows.map((r, i) => (i === 4 ? [r[0], '-'] : r)), boxes }],
    }
    expect(readConfidence({ label: '4', value: '-', series: days, pages: [dashPage] })).toBeNull()
  })
})
