import { describe, expect, it } from 'vitest'
import type { ExtractionField } from '@/types/extraction'
import { findSeriesTotals, identifyingFields, validateRecords } from './cross-checks'
import { DEFAULT_CHECK_POLICY } from './check-policy'

const f = (key: string, label: string, dataType: ExtractionField['dataType'], required = false): ExtractionField => ({
  key, label, dataType, required, sortOrder: 0,
})

const days = Array.from({ length: 7 }, (_, i) => f(`day_${i + 1}`, String(i + 1), 'number'))
const fields = [f('id', 'ID', 'string', true), f('name', 'NAME', 'string', true), ...days, f('total', 'T/HRS', 'number')]

function record(id: string, hours: (string | null)[], total: string | null, who = ['701', 'Asha Rao']) {
  const values: Record<string, { value: string | null; status: string; confidence: number }> = {
    id: { value: who[0], status: 'extracted', confidence: 0.95 },
    name: { value: who[1], status: 'extracted', confidence: 0.95 },
    total: { value: total, status: total === null ? 'missing' : 'extracted', confidence: 0.95 },
  }
  hours.forEach((h, i) => (values[`day_${i + 1}`] = { value: h, status: 'extracted', confidence: 0.95 }))
  return { id, values }
}

const week = ['10', '10', '10', '0', '10', '10', '10']

describe('findSeriesTotals', () => {
  it('pairs a run of day cells with the total column that follows', () => {
    const pairs = findSeriesTotals(fields)
    expect(pairs).toHaveLength(1)
    expect(pairs[0].total.key).toBe('total')
    expect(pairs[0].cells).toHaveLength(7)
  })

  it('also pairs a total the AI typed as text', () => {
    const textTotal = [...days, f('total', 'Total', 'string')]
    expect(findSeriesTotals(textTotal)).toHaveLength(1)
    const issues = validateRecords(textTotal, [{ id: 'r1', values: Object.fromEntries([
      ...week.map((h, i) => [`day_${i + 1}`, { value: h, status: 'extracted', confidence: 0.95 }]),
      ['total', { value: '70', status: 'extracted', confidence: 0.95 }],
    ]) }]).get('r1')!
    expect(issues).toMatchObject([{ fieldKey: 'total', type: 'math_mismatch' }])
  })

  it('finds nothing when the next column is not a total', () => {
    expect(findSeriesTotals([...days, f('site', 'Site', 'string')])).toEqual([])
    expect(findSeriesTotals([...days, f('rate', 'Rate', 'number')])).toEqual([])
    expect(findSeriesTotals([f('a', 'A', 'string'), f('total', 'Total hours', 'number')])).toEqual([])
  })
})

describe('validateRecords — totals', () => {
  it('is silent when the cells add up to the total', () => {
    expect(validateRecords(fields, [record('r1', week, '60')]).get('r1')).toEqual([])
  })

  it('warns on the total when it disagrees with the cells', () => {
    const issues = validateRecords(fields, [record('r1', week, '70')]).get('r1')!
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ fieldKey: 'total', type: 'math_mismatch', severity: 'warning' })
    expect(issues[0].message).toContain('T/HRS is 70, but columns 1–7 add up to 60')
  })

  it('treats blank cells as zero and ignores rounding', () => {
    expect(validateRecords(fields, [record('r1', ['7.5', '7.5', null, null, null, null, null], '15')]).get('r1')).toEqual([])
    expect(validateRecords(fields, [record('r1', ['0.1', '0.2', null, null, null, null, null], '0.3')]).get('r1')).toEqual([])
  })

  it('does not compare when there is no total or a cell is not a number', () => {
    expect(validateRecords(fields, [record('r1', week, null)]).get('r1')).toEqual([])

    const issues = validateRecords(fields, [record('r1', ['P', '10', '10', '0', '10', '10', '10'], '60')]).get('r1')!
    expect(issues.map((i) => i.type)).toEqual(['invalid_number'])
  })
})

describe('validateRecords — duplicates', () => {
  it('flags every record that shares all identifying values, ignoring case and spacing', () => {
    const result = validateRecords(fields, [
      record('r1', week, '60'),
      record('r2', ['8', '10', '10', '0', '10', '10', '10'], '58', ['701', ' asha rao ']),
      record('r3', week, '60', ['702', 'Vikram Shetty']),
    ])
    expect(result.get('r1')!.map((i) => i.type)).toEqual(['duplicate'])
    expect(result.get('r2')!.map((i) => i.type)).toEqual(['duplicate'])
    expect(result.get('r3')).toEqual([])
    expect(result.get('r1')![0].message).toContain('1 other record has the same ID and NAME')
  })

  it('does not call records duplicates when only part of the identity matches', () => {
    const result = validateRecords(fields, [record('r1', week, '60'), record('r2', week, '60', ['701', 'Someone Else'])])
    expect(result.get('r1')).toEqual([])
    expect(result.get('r2')).toEqual([])
  })

  it('leaves a missing identifier to the missing-value check', () => {
    const result = validateRecords(fields, [
      record('r1', week, '60', ['', 'Asha Rao']),
      record('r2', week, '60', ['', 'Asha Rao']),
    ])
    expect(result.get('r1')!.map((i) => i.type)).toEqual(['missing'])
    expect(result.get('r2')!.map((i) => i.type)).toEqual(['missing'])
  })

  it('calls an exact copy a copy, even when nothing is marked required', () => {
    const optional = fields.map((x) => ({ ...x, required: false }))
    const result = validateRecords(optional, [record('r1', week, '60'), record('r2', week, '60')])
    expect(result.get('r1')!.map((i) => i.type)).toEqual(['duplicate'])
    expect(result.get('r2')![0].message).toContain('exactly the same values')
  })

  it('with nothing required, matches on fields named like an identifier', () => {
    const optional = [
      f('emp', 'Employee Number', 'string'),
      f('company', 'Company', 'string'),
      ...days,
      f('total', 'T/HRS', 'number'),
    ]
    const card = (id: string, emp: string, company: string, hours: string[]) => ({
      id,
      values: Object.fromEntries([
        ['emp', { value: emp, status: 'extracted', confidence: 0.95 }],
        ['company', { value: company, status: 'extracted', confidence: 0.95 }],
        ...hours.map((h, i) => [`day_${i + 1}`, { value: h, status: 'extracted', confidence: 0.95 }]),
      ]),
    })
    const result = validateRecords(optional, [
      card('r1', 'E-1', 'North', week),
      card('r2', 'E-1', 'North', ['8', ...week.slice(1)]),
      card('r3', 'E-2', 'North', week),
    ])
    expect(result.get('r1')![0].message).toContain('the same Employee Number')
    expect(result.get('r2')!.map((i) => i.type)).toEqual(['duplicate'])
    // Same company is not the same person
    expect(result.get('r3')).toEqual([])
  })

  it('keeps the same person’s different weeks apart when there is a period field', () => {
    const weekly = [f('name', 'Employee Name', 'string'), f('ending', 'Week Ending', 'date'), f('hours', 'Total Hours', 'number')]
    const row = (id: string, ending: string, hours: string) => ({
      id,
      values: {
        name: { value: 'Asha Rao', status: 'extracted', confidence: 0.95 },
        ending: { value: ending, status: 'extracted', confidence: 0.95 },
        hours: { value: hours, status: 'extracted', confidence: 0.95 },
      },
    })
    const apart = validateRecords(weekly, [row('r1', '2026-10-02', '40'), row('r2', '2026-10-09', '38')])
    expect(apart.get('r1')).toEqual([])
    const same = validateRecords(weekly, [row('r1', '2026-10-09', '40'), row('r2', '2026-10-09', '38')])
    expect(same.get('r1')![0].message).toContain('the same Employee Name and Week Ending')
  })

  it('does not call nearly empty records copies', () => {
    const optional = fields.map((x) => ({ ...x, required: false }))
    const blank = (id: string) => ({ id, values: { total: { value: '0', status: 'extracted', confidence: 0.9 } } })
    const result = validateRecords(optional, [blank('r1'), blank('r2')])
    expect(result.get('r1')).toEqual([])
  })
})

describe('identifyingFields', () => {
  it('prefers the fields the user marked required', () => {
    expect(identifyingFields(fields).map((x) => x.key)).toEqual(['id', 'name'])
  })

  it('finds nothing to match on when no label reads like an identifier', () => {
    expect(identifyingFields([f('company', 'Company', 'string'), ...days])).toEqual([])
  })
})

describe('validateRecords — combining', () => {
  it('keeps one issue per field, the field’s own problem first', () => {
    // total is badly formatted AND would mismatch: only the format problem is reported
    const issues = validateRecords(fields, [record('r1', week, 'sixty')]).get('r1')!
    expect(issues.map((i) => [i.fieldKey, i.type])).toEqual([['total', 'invalid_number']])
  })

  it('reports a mismatch and a duplicate together when they are on different fields', () => {
    const result = validateRecords(fields, [record('r1', week, '70'), record('r2', week, '60')])
    expect(result.get('r1')!.map((i) => i.type).sort()).toEqual(['duplicate', 'math_mismatch'])
  })
})

describe('validateRecords — job settings', () => {
  it('flags a day with more hours than the job allows in one day', () => {
    const issues = validateRecords(fields, [record('r1', ['10', '10', '100', '0', '10', '10', '10'], '150')]).get('r1')!
    expect(issues).toContainEqual(
      expect.objectContaining({ fieldKey: 'day_3', type: 'out_of_range', severity: 'warning' })
    )
    expect(issues.find((i) => i.fieldKey === 'day_3')!.message).toBe(
      '100 hours is more than the 16 allowed in one day. Check it against the document.'
    )
  })

  it('uses the job’s own limit and tolerance', () => {
    const policy = { ...DEFAULT_CHECK_POLICY, maxHoursPerDay: 9, toleranceHours: 0.5 }
    const issues = validateRecords(fields, [record('r1', week, '60.25')], policy).get('r1')!
    // Every 10-hour day is over 9; the 0.25 difference in the total is within tolerance
    expect(issues.filter((i) => i.type === 'out_of_range')).toHaveLength(6)
    expect(issues.some((i) => i.type === 'math_mismatch')).toBe(false)
  })
})
