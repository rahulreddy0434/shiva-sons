import { describe, expect, it } from 'vitest'
import { buildSuggestedInstructions, isDayOfMonthHeader } from './suggested-instructions'

const days = Array.from({ length: 31 }, (_, i) => String(i + 1))

describe('isDayOfMonthHeader', () => {
  it('accepts 1 to 31 only', () => {
    expect(days.every(isDayOfMonthHeader)).toBe(true)
    expect(isDayOfMonthHeader(' 7 ')).toBe(true)
    for (const name of ['0', '32', '01', '1.5', 'Day 1', 'ID', '']) {
      expect(isDayOfMonthHeader(name)).toBe(false)
    }
  })
})

describe('buildSuggestedInstructions', () => {
  it('returns nothing when the template has no columns', () => {
    expect(buildSuggestedInstructions([])).toBe('')
  })

  it('lists every column for an ordinary template', () => {
    expect(buildSuggestedInstructions(['Employee Name', 'Date', 'Total Hours'])).toBe(
      'Extract Employee Name, Date, Total Hours from each document.'
    )
  })

  it('explains day-of-month columns instead of listing 31 numbers', () => {
    const text = buildSuggestedInstructions(['ID', 'NAME', ...days, 'T/HRS'])

    expect(text).toContain('Extract ID, NAME, T/HRS from each document.')
    expect(text).toContain('Columns 1 to 31 are the days of the month')
    expect(text).toContain('hours worked that day')
    expect(text).toContain('Enter 0 for a day that was not worked')
    expect(text).not.toContain('1, 2, 3')
  })

  it('does not mistake a few numeric headers for a calendar', () => {
    expect(buildSuggestedInstructions(['Item', '1', '2', '3'])).toBe('Extract Item, 1, 2, 3 from each document.')
  })
})
