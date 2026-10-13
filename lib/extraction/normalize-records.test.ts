import { describe, expect, it } from 'vitest'
import type { ExtractionField } from '@/types/extraction'
import { isEmptyRecord, normalizeRecord } from './normalize-records'

const fields: ExtractionField[] = [
  { key: 'name', label: 'Name', dataType: 'string', required: true, sortOrder: 0 },
  { key: 'hours', label: 'Hours', dataType: 'number', required: false, sortOrder: 1 },
]

describe('normalizeRecord', () => {
  it('keeps a well-formed record, turning numbers into strings', () => {
    expect(
      normalizeRecord(
        {
          name: { value: ' Asha ', confidence: 0.92, status: 'extracted' },
          hours: { value: 10, confidence: 0.8, status: 'extracted' },
        },
        fields
      )
    ).toEqual([
      { fieldKey: 'name', value: 'Asha', confidence: 0.92, status: 'extracted' },
      { fieldKey: 'hours', value: '10', confidence: 0.8, status: 'extracted' },
    ])
  })

  it('drops keys that are not in the schema', () => {
    const result = normalizeRecord({ name: { value: 'A', status: 'extracted' }, salary: { value: '999' } }, fields)
    expect(result.map((r) => r.fieldKey)).toEqual(['name', 'hours'])
  })

  it('marks fields the model left out as missing instead of failing', () => {
    expect(normalizeRecord({ name: { value: 'A', status: 'extracted', confidence: 1 } }, fields)[1]).toEqual({
      fieldKey: 'hours',
      value: null,
      confidence: null,
      status: 'missing',
    })
  })

  it('survives null, array and non-object entries', () => {
    for (const raw of [null, undefined, [], 'text', 42]) {
      expect(normalizeRecord(raw, fields).every((r) => r.status === 'missing' && r.value === null)).toBe(true)
    }
    const result = normalizeRecord({ name: null, hours: [1, 2] }, fields)
    expect(result.map((r) => r.status)).toEqual(['missing', 'missing'])
  })

  it('accepts a bare value but does not treat it as confirmed', () => {
    expect(normalizeRecord({ name: 'Asha', hours: 8 }, fields)).toEqual([
      { fieldKey: 'name', value: 'Asha', confidence: null, status: 'ambiguous' },
      { fieldKey: 'hours', value: '8', confidence: null, status: 'ambiguous' },
    ])
  })

  it('replaces an unknown status and clamps confidence', () => {
    const [name, hours] = normalizeRecord(
      { name: { value: 'A', status: 'certain', confidence: 7 }, hours: { value: '8', status: 'extracted', confidence: -1 } },
      fields
    )
    expect(name).toMatchObject({ status: 'ambiguous', confidence: 1 })
    expect(hours).toMatchObject({ status: 'extracted', confidence: 0 })
  })

  it('never reports a value as missing or an empty value as extracted', () => {
    const [name, hours] = normalizeRecord(
      { name: { value: 'A', status: 'missing' }, hours: { value: '  ', status: 'extracted' } },
      fields
    )
    expect(name).toMatchObject({ value: 'A', status: 'ambiguous' })
    expect(hours).toMatchObject({ value: null, status: 'missing' })
  })
})

describe('isEmptyRecord', () => {
  it('is true only when no field has a value', () => {
    expect(isEmptyRecord(normalizeRecord({}, fields))).toBe(true)
    expect(isEmptyRecord(normalizeRecord({ hours: { value: 0, status: 'extracted' } }, fields))).toBe(false)
  })
})
