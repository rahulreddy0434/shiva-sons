import { describe, expect, it } from 'vitest'
import { DEFAULT_CHECK_POLICY, parseCheckPolicyInput, readCheckPolicy } from './check-policy'

describe('readCheckPolicy', () => {
  it('uses the defaults when nothing is stored', () => {
    expect(readCheckPolicy(null)).toEqual(DEFAULT_CHECK_POLICY)
    expect(DEFAULT_CHECK_POLICY).toMatchObject({ maxHoursPerDay: 16, maxShiftHours: 16, maxBreakMinutes: 180, roundToMinutes: null })
  })

  it('keeps stored settings and replaces unusable ones with defaults', () => {
    expect(readCheckPolicy({ maxHoursPerDay: 12, maxShiftHours: 'lots', maxBreakMinutes: -5, roundToMinutes: 15 })).toEqual({
      ...DEFAULT_CHECK_POLICY,
      maxHoursPerDay: 12,
      roundToMinutes: 15,
    })
    expect(readCheckPolicy({ roundToMinutes: 7 }).roundToMinutes).toBeNull()
  })
})

describe('parseCheckPolicyInput', () => {
  const valid = { maxHoursPerDay: '12', maxShiftHours: '14', maxBreakMinutes: '60', toleranceHours: '0.25', roundToMinutes: '15' }

  it('accepts settings typed on screen', () => {
    expect(parseCheckPolicyInput(valid)).toEqual({
      policy: { maxHoursPerDay: 12, maxShiftHours: 14, maxBreakMinutes: 60, toleranceHours: 0.25, roundToMinutes: 15 },
    })
    expect(parseCheckPolicyInput({ ...valid, roundToMinutes: '' })).toMatchObject({ policy: { roundToMinutes: null } })
  })

  it('names the setting that is out of range or blank', () => {
    expect(parseCheckPolicyInput({ ...valid, maxHoursPerDay: '30' })).toEqual({
      error: 'Most hours in one day must be a number from 1 to 24.',
    })
    expect(parseCheckPolicyInput({ ...valid, maxBreakMinutes: '' })).toEqual({
      error: 'Longest break (minutes) must be a number from 0 to 720.',
    })
    expect(parseCheckPolicyInput({ ...valid, roundToMinutes: '7' })).toEqual({ error: 'Choose one of the rounding options.' })
    expect(parseCheckPolicyInput(null)).toEqual({ error: 'Missing settings' })
  })
})
