import { describe, expect, it } from 'vitest'
import type { ExtractionField } from '@/types/extraction'
import { groupFields } from './group-fields'

function field(label: string, dataType: ExtractionField['dataType'] = 'number'): ExtractionField {
  return { key: label.toLowerCase().replace(/\W+/g, '_'), label, dataType, required: false, sortOrder: 0 }
}

const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => field(String(from + i)))

describe('groupFields', () => {
  it('turns a month of day columns into one series between ordinary fields', () => {
    const groups = groupFields([field('ID', 'string'), field('NAME', 'string'), ...days(1, 31), field('T/HRS')])

    expect(groups.map((g) => g.kind)).toEqual(['single', 'single', 'series', 'single'])
    const series = groups[2]
    expect(series.kind === 'series' && series.fields.map((f) => f.label)).toEqual(days(1, 31).map((f) => f.label))
  })

  it('keeps every field exactly once and in order', () => {
    const input = [field('A', 'string'), ...days(1, 7), field('B', 'string'), ...days(8, 10)]
    const flat = groupFields(input).flatMap((g) => (g.kind === 'single' ? [g.field] : g.fields))
    expect(flat).toEqual(input)
  })

  it('leaves a short numeric run as ordinary fields', () => {
    expect(groupFields(days(1, 4)).map((g) => g.kind)).toEqual(['single', 'single', 'single', 'single'])
  })

  it('does not merge runs of different types', () => {
    const groups = groupFields([...days(1, 5), ...['6', '7', '8', '9', '10'].map((l) => field(l, 'string'))])
    expect(groups.map((g) => (g.kind === 'series' ? g.fields.length : 0))).toEqual([5, 5])
  })

  it('returns only singles when nothing is numeric', () => {
    expect(groupFields([field('Name', 'string'), field('Date', 'date')]).every((g) => g.kind === 'single')).toBe(true)
  })

  it('handles an empty list', () => {
    expect(groupFields([])).toEqual([])
  })
})
