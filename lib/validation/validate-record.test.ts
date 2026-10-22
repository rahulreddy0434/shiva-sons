import { describe, expect, it } from 'vitest'
import type { ExtractionField } from '@/types/extraction'
import {
  isValidDate,
  isValidDuration,
  isValidNumber,
  isValidTime,
  reviewState,
  validateField,
  validateRecord,
} from './validate-record'

function field(overrides: Partial<ExtractionField> = {}): ExtractionField {
  return { key: 'f', label: 'Field', dataType: 'string', required: false, sortOrder: 0, ...overrides }
}

describe('format checks', () => {
  it('accepts real ISO dates and rejects impossible or differently formatted ones', () => {
    expect(isValidDate('2026-08-15')).toBe(true)
    expect(isValidDate('2028-02-29')).toBe(true) // leap year
    expect(isValidDate('2026-02-29')).toBe(false)
    expect(isValidDate('2026-02-30')).toBe(false)
    expect(isValidDate('2026-13-01')).toBe(false)
    expect(isValidDate('15/08/2026')).toBe(false)
    expect(isValidDate('Aug-26')).toBe(false)
  })

  it('accepts 24-hour times only', () => {
    expect(isValidTime('07:30')).toBe(true)
    expect(isValidTime('23:59')).toBe(true)
    expect(isValidTime('00:00')).toBe(true)
    expect(isValidTime('24:00')).toBe(false)
    expect(isValidTime('7:30')).toBe(false)
    expect(isValidTime('07:60')).toBe(false)
    expect(isValidTime('7:30 PM')).toBe(false)
  })

  it('accepts plain numbers only', () => {
    expect(isValidNumber('10')).toBe(true)
    expect(isValidNumber('7.5')).toBe(true)
    expect(isValidNumber('0')).toBe(true)
    expect(isValidNumber('1,000')).toBe(false)
    expect(isValidNumber('10 hrs')).toBe(false)
    expect(isValidNumber('P')).toBe(false)
    expect(isValidNumber('1e3')).toBe(false)
  })

  it('accepts durations as minutes or H:MM', () => {
    expect(isValidDuration('30')).toBe(true)
    expect(isValidDuration('0:30')).toBe(true)
    expect(isValidDuration('1:05')).toBe(true)
    expect(isValidDuration('1:75')).toBe(false)
    expect(isValidDuration('half hour')).toBe(false)
  })
})

describe('validateField', () => {
  it('blocks on a missing required value, including whitespace and null', () => {
    const required = field({ required: true, label: 'Employee name' })
    for (const value of [null, '', '   ']) {
      expect(validateField(required, { value })).toMatchObject({ type: 'missing', severity: 'blocking' })
    }
    expect(validateField(required, undefined)).toMatchObject({ type: 'missing', severity: 'blocking' })
  })

  it('allows an optional field to be empty', () => {
    expect(validateField(field(), { value: null })).toBeNull()
    expect(validateField(field({ dataType: 'number' }), { value: '' })).toBeNull()
  })

  it('blocks on a value that does not fit the field type', () => {
    expect(validateField(field({ dataType: 'date' }), { value: '15 Aug' })).toMatchObject({ type: 'invalid_date', severity: 'blocking' })
    expect(validateField(field({ dataType: 'time' }), { value: '7am' })).toMatchObject({ type: 'invalid_time', severity: 'blocking' })
    expect(validateField(field({ dataType: 'number' }), { value: 'ten' })).toMatchObject({ type: 'invalid_number', severity: 'blocking' })
    expect(validateField(field({ dataType: 'duration' }), { value: 'lunch' })).toMatchObject({ type: 'invalid_duration', severity: 'blocking' })
  })

  it('still blocks on a bad format after a person typed it', () => {
    expect(validateField(field({ dataType: 'number' }), { value: 'ten', status: 'user_corrected' })).toMatchObject({
      type: 'invalid_number',
      severity: 'blocking',
    })
  })

  it('warns when the AI flagged the value or was not confident', () => {
    expect(validateField(field(), { value: 'Jon', status: 'ambiguous', confidence: 0.9 })).toMatchObject({ type: 'ambiguous', severity: 'warning' })
    expect(validateField(field(), { value: 'Jon', status: 'extracted', confidence: 0.4 })).toMatchObject({ type: 'ambiguous', severity: 'warning' })
    expect(validateField(field(), { value: 'Jon', status: 'extracted', confidence: 0.7 })).toBeNull()
  })

  it('never treats high confidence as proof against a format error', () => {
    expect(validateField(field({ dataType: 'number' }), { value: 'P', status: 'extracted', confidence: 0.99 })).toMatchObject({
      severity: 'blocking',
    })
  })

  it('drops the uncertainty warning once a person has corrected the value', () => {
    expect(validateField(field(), { value: 'John', status: 'user_corrected', confidence: 0.2 })).toBeNull()
  })

  it('says when the writing itself was hard to read, even if the AI was sure', () => {
    const issue = validateField(field({ label: 'Day 3' }), { value: '6', status: 'extracted', confidence: 0.95, ocrConfidence: 0.35 })
    expect(issue).toMatchObject({ type: 'ambiguous', severity: 'warning' })
    expect(issue!.message).toBe('The writing for Day 3 was hard to read (35% sure). Check it against the document.')
    expect(validateField(field(), { value: '6', status: 'extracted', confidence: 0.95, ocrConfidence: 0.6 })).toBeNull()
    expect(validateField(field(), { value: '6', status: 'user_corrected', confidence: 0.95, ocrConfidence: 0.1 })).toBeNull()
  })

  it('does not warn about confidence when none was recorded', () => {
    expect(validateField(field(), { value: 'John', status: 'extracted', confidence: null })).toBeNull()
    expect(validateField(field(), { value: 'John' })).toBeNull()
  })
})

describe('validateRecord', () => {
  const fields = [
    field({ key: 'name', label: 'Name', required: true }),
    field({ key: 'hours', label: 'Hours', dataType: 'number' }),
    field({ key: 'site', label: 'Site' }),
  ]

  it('reports one issue per problem field, including fields with no stored value at all', () => {
    const issues = validateRecord(fields, { hours: { value: 'x' } })
    expect(issues.map((i) => [i.fieldKey, i.type])).toEqual([
      ['name', 'missing'],
      ['hours', 'invalid_number'],
    ])
  })

  it('returns nothing for a clean record', () => {
    expect(validateRecord(fields, { name: { value: 'A' }, hours: { value: '8' } })).toEqual([])
  })
})

describe('reviewState', () => {
  const blocking = { fieldKey: 'a', type: 'missing', severity: 'blocking', message: '' } as const
  const warning = { fieldKey: 'a', type: 'ambiguous', severity: 'warning', message: '' } as const

  it('keeps a record in needs-attention while it has a blocking issue, even if marked reviewed', () => {
    expect(reviewState([blocking], false)).toBe('needs_attention')
    expect(reviewState([blocking], true)).toBe('needs_attention')
  })

  it('lets marking reviewed settle warnings', () => {
    expect(reviewState([warning], false)).toBe('needs_attention')
    expect(reviewState([warning], true)).toBe('reviewed')
  })

  it('distinguishes clean-but-unreviewed from reviewed', () => {
    expect(reviewState([], false)).toBe('ready')
    expect(reviewState([], true)).toBe('reviewed')
  })
})
