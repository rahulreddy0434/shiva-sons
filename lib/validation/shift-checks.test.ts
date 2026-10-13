import { describe, expect, it } from 'vitest'
import type { ExtractionField } from '@/types/extraction'
import { validateRecords } from './cross-checks'
import {
  DEFAULT_SHIFT_POLICY,
  detectShiftFields,
  durationMinutes,
  expectedHours,
  shiftIssues,
  shiftMinutes,
} from './shift-checks'

const f = (key: string, label: string, dataType: ExtractionField['dataType']): ExtractionField => ({
  key, label, dataType, required: false, sortOrder: 0,
})

const fields = [
  f('name', 'Employee name', 'string'),
  f('date', 'Date', 'date'),
  f('start', 'Start time', 'time'),
  f('end', 'End time', 'time'),
  f('break', 'Break duration', 'duration'),
  f('total', 'Total hours', 'number'),
  f('ot', 'Overtime hours', 'number'),
]

const card = (start: string | null, end: string | null, brk: string | null, total: string | null) => ({
  start: { value: start },
  end: { value: end },
  break: { value: brk },
  total: { value: total },
})

describe('detectShiftFields', () => {
  it('finds start, end, break and total, and never mistakes overtime for the total', () => {
    const shift = detectShiftFields(fields)!
    expect([shift.start.key, shift.end.key, shift.breakDuration?.key, shift.total?.key]).toEqual(['start', 'end', 'break', 'total'])
  })

  it('understands other common headings', () => {
    const shift = detectShiftFields([f('a', 'Time In', 'time'), f('b', 'Time Out', 'time'), f('c', 'Lunch', 'duration')])!
    expect([shift.start.key, shift.end.key, shift.breakDuration?.key]).toEqual(['a', 'b', 'c'])
  })

  it('returns nothing for a card without clock times, such as a monthly hours grid', () => {
    expect(detectShiftFields([f('id', 'ID', 'string'), f('day_1', '1', 'number'), f('t', 'T/HRS', 'number')])).toBeNull()
    expect(detectShiftFields([f('s', 'Start time', 'time')])).toBeNull()
  })
})

describe('time arithmetic', () => {
  it('measures a day shift', () => {
    expect(shiftMinutes('08:00', '17:00')).toEqual({ minutes: 540, overnight: false })
  })

  it('reads an end before the start as the next day', () => {
    expect(shiftMinutes('22:00', '06:00')).toEqual({ minutes: 480, overnight: true })
    expect(shiftMinutes('23:30', '00:15')).toEqual({ minutes: 45, overnight: true })
  })

  it('treats identical times as a full day rather than zero', () => {
    expect(shiftMinutes('08:00', '08:00')).toEqual({ minutes: 1440, overnight: true })
  })

  it('reads a break as minutes or H:MM', () => {
    expect(durationMinutes('30')).toBe(30)
    expect(durationMinutes('0:45')).toBe(45)
    expect(durationMinutes('1:15')).toBe(75)
  })

  it('deducts the break and applies rounding only when the policy asks for it', () => {
    expect(expectedHours('08:00', '17:00', 60, DEFAULT_SHIFT_POLICY)).toBe(8)
    expect(expectedHours('08:00', '16:50', 30, DEFAULT_SHIFT_POLICY)).toBeCloseTo(8.3333, 3)
    expect(expectedHours('08:00', '16:50', 30, { ...DEFAULT_SHIFT_POLICY, roundToMinutes: 15 })).toBe(8.25)
    expect(expectedHours('22:00', '06:00', 30, DEFAULT_SHIFT_POLICY)).toBe(7.5)
  })
})

describe('shiftIssues', () => {
  it('is silent for a consistent card', () => {
    expect(shiftIssues(fields, card('08:00', '17:00', '60', '8'))).toEqual([])
    expect(shiftIssues(fields, card('08:00', '17:00', '1:00', '8'))).toEqual([])
    expect(shiftIssues(fields, card('08:00', '16:30', null, '8.5'))).toEqual([])
  })

  it('flags a total that disagrees with the times and break', () => {
    const issues = shiftIssues(fields, card('08:00', '17:00', '60', '9'))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ fieldKey: 'total', type: 'math_mismatch', severity: 'warning' })
    expect(issues[0].message).toContain('08:00 to 17:00 less a 60-minute break is 8 hours')
  })

  it('asks for confirmation of an overnight shift without calling it wrong', () => {
    const issues = shiftIssues(fields, card('22:00', '06:00', '30', '7.5'))
    expect(issues.map((i) => [i.fieldKey, i.type])).toEqual([['end', 'time_order']])
    expect(issues[0].message).toContain('overnight shift of 8 hours')
  })

  it('flags an implausibly long shift, which is usually a misread time', () => {
    // 07:00 read as 17:00 → looks like a 23-hour overnight shift
    const issues = shiftIssues(fields, card('17:00', '16:00', null, null))
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('would be 23 hours')
  })

  it('flags a break that is too long or as long as the shift', () => {
    expect(shiftIssues(fields, card('08:00', '17:00', '240', null)).map((i) => [i.fieldKey, i.type])).toEqual([
      ['break', 'out_of_range'],
    ])
    const whole = shiftIssues(fields, card('08:00', '09:00', '60', '0'))
    expect(whole).toHaveLength(1)
    expect(whole[0].message).toContain('as long as the whole shift')
  })

  it('respects a rounding policy when comparing the total', () => {
    const values = card('08:00', '16:50', '30', '8.25')
    expect(shiftIssues(fields, values)).toHaveLength(1)
    expect(shiftIssues(fields, values, { ...DEFAULT_SHIFT_POLICY, roundToMinutes: 15 })).toEqual([])
  })

  it('leaves missing or badly formatted values to their own checks', () => {
    expect(shiftIssues(fields, card(null, '17:00', '60', '8'))).toEqual([])
    expect(shiftIssues(fields, card('8am', '17:00', '60', '8'))).toEqual([])
    expect(shiftIssues(fields, card('08:00', '17:00', 'lunch', '8'))).toEqual([])
    expect(shiftIssues(fields, card('08:00', '17:00', '60', 'eight'))).toEqual([])
    expect(shiftIssues(fields, card('08:00', '17:00', '60', null))).toEqual([])
  })
})

describe('validateRecords with shift checks', () => {
  it('includes shift warnings alongside the other checks', () => {
    const result = validateRecords(fields, [{ id: 'r1', values: card('08:00', '17:00', '60', '9') }])
    expect(result.get('r1')!.map((i) => i.type)).toEqual(['math_mismatch'])
  })
})
