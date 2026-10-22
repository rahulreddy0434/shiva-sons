import { describe, expect, it } from 'vitest'
import { chosenSheetId } from './sheet-choice'

const sheets = [
  { id: 'cover', columnCount: 0 },
  { id: 'jan', columnCount: 35 },
  { id: 'feb', columnCount: 35 },
]

describe('chosenSheetId', () => {
  it('keeps the sheet the user picked', () => {
    expect(chosenSheetId(sheets, 'feb')).toBe('feb')
  })

  it('falls back to the sheet with the most headings when nothing, a headless sheet or an old sheet was picked', () => {
    expect(chosenSheetId(sheets, null)).toBe('jan')
    expect(chosenSheetId(sheets, 'cover')).toBe('jan')
    expect(chosenSheetId(sheets, 'from-a-replaced-template')).toBe('jan')
  })

  it('does not default to a title-only cover sheet', () => {
    expect(chosenSheetId([{ id: 'cover', columnCount: 1 }, { id: 'oct', columnCount: 34 }], null)).toBe('oct')
  })

  it('finds nothing when no sheet has headings', () => {
    expect(chosenSheetId([{ id: 'cover', columnCount: 0 }], null)).toBeNull()
  })
})
