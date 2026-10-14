import { describe, expect, it } from 'vitest'
import type { ExtractionField } from '@/types/extraction'
import type { NormalizedFieldResult } from './normalize-records'
import { continuesRecord, mergeRecords, pageBatches, PAGES_PER_CALL } from './page-batches'

const field = (key: string, required = false): ExtractionField => ({
  key, label: key, dataType: 'string', required, sortOrder: 0,
})
const fields = [field('card_no', true), field('name', true), field('day_1'), field('day_20'), field('total')]

function record(values: Record<string, string | null>, confidence = 0.9): NormalizedFieldResult[] {
  return fields.map((f) => {
    const value = values[f.key] ?? null
    return { fieldKey: f.key, value, confidence: value === null ? null : confidence, status: value === null ? 'missing' : 'extracted' }
  })
}

describe('pageBatches', () => {
  it('keeps a short document in one call', () => {
    expect(pageBatches(2)).toEqual([{ from: 1, to: 2 }])
    expect(pageBatches(PAGES_PER_CALL)).toEqual([{ from: 1, to: PAGES_PER_CALL }])
  })

  it('splits a long document into consecutive parts', () => {
    expect(pageBatches(20, 8)).toEqual([
      { from: 1, to: 8 },
      { from: 9, to: 16 },
      { from: 17, to: 20 },
    ])
  })

  it('has nothing to do for a document with no pages', () => {
    expect(pageBatches(0)).toEqual([])
  })
})

describe('continuesRecord', () => {
  const front = record({ card_no: '4418', name: 'Tomas Testcase', day_1: '8' })

  it('joins the halves of one card that carry the same identity', () => {
    expect(continuesRecord(front, record({ card_no: '4418', name: 'tomas  testcase', day_20: '9' }), fields)).toBe(true)
  })

  it('keeps different cards apart', () => {
    expect(continuesRecord(front, record({ card_no: '4419', name: 'Tomas Testcase' }), fields)).toBe(false)
  })

  it('keeps them apart when an identifying value is missing on either side', () => {
    expect(continuesRecord(front, record({ card_no: '4418', name: null, day_20: '9' }), fields)).toBe(false)
  })

  it('never joins when nothing identifies a record', () => {
    const loose = fields.map((f) => ({ ...f, required: false }))
    expect(continuesRecord(front, front, loose)).toBe(false)
  })
})

describe('mergeRecords', () => {
  it('takes each value from the half that has it', () => {
    const merged = mergeRecords(
      record({ card_no: '4418', name: 'Tomas', day_1: '8' }),
      record({ card_no: '4418', name: 'Tomas', day_20: '9', total: '221' })
    )
    expect(Object.fromEntries(merged.map((r) => [r.fieldKey, [r.value, r.status]]))).toEqual({
      card_no: ['4418', 'extracted'],
      name: ['Tomas', 'extracted'],
      day_1: ['8', 'extracted'],
      day_20: ['9', 'extracted'],
      total: ['221', 'extracted'],
    })
  })

  it('marks a value the halves disagree on as uncertain instead of choosing one', () => {
    const merged = mergeRecords(
      record({ card_no: '4418', name: 'Tomas', total: '120' }, 0.95),
      record({ card_no: '4418', name: 'Tomas', total: '221' }, 0.6)
    )
    expect(merged.find((r) => r.fieldKey === 'total')).toEqual({
      fieldKey: 'total',
      value: '120',
      confidence: 0.6,
      status: 'ambiguous',
    })
  })
})
