import { describe, expect, it } from 'vitest'
import { applyBulkChoice, approvalProblem, moveItem, suggestsRequired, undecidedFields } from './required-choice'

describe('suggestsRequired', () => {
  it('suggests the fields that say who a record is about', () => {
    for (const label of ['ID', 'NAME', 'Employee No', 'Employee Number', 'Emp #', 'Card No.', 'Employee Name', 'Worker'])
      expect(suggestsRequired(label), label).toBe(true)
  })

  it('does not suggest serial numbers, days, totals or other details', () => {
    for (const label of ['SI.NO', 'S.No', '1', '31', 'T/HRS', 'TRADE', 'Company', 'O.T', 'Week Ending'])
      expect(suggestsRequired(label), label).toBe(false)
  })
})

describe('applyBulkChoice', () => {
  const fields = [
    { label: 'ID', required: null },
    { label: 'NAME', required: false },
    { label: '1', required: null },
    { label: '2', required: true },
    { label: 'T/HRS', required: null },
  ] as { label: string; required: boolean | null }[]

  it('makes undecided day columns Optional and leaves choices already made alone', () => {
    expect(applyBulkChoice(fields, 'days-optional').map((f) => f.required)).toEqual([null, false, false, true, null])
  })

  it('marks undecided suggested fields Required, then the rest Optional', () => {
    const step = applyBulkChoice(fields, 'suggested-required')
    expect(step.map((f) => f.required)).toEqual([true, false, null, true, null])
    expect(applyBulkChoice(step, 'rest-optional').map((f) => f.required)).toEqual([true, false, false, true, false])
  })
})

describe('moveItem', () => {
  it('moves an item down and up', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('ignores moves off the ends', () => {
    expect(moveItem(['a', 'b'], 0, 0)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 1, 9)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
  })
})

describe('approvalProblem', () => {
  const field = (label: string, required: boolean | null) => ({ label, required })

  it('allows approval once every field is Required or Optional', () => {
    expect(approvalProblem([field('ID', true), field('1', false)])).toBeNull()
  })

  it('names the fields still to choose, at most three of them', () => {
    const fields = [field('ID', true), field('NAME', null), field('1', null), field('2', null), field('3', null)]
    expect(undecidedFields(fields)).toHaveLength(4)
    expect(approvalProblem(fields)).toBe(
      'Choose Required or Optional for every field before approving. Still to choose: “NAME”, “1”, “2” and 1 more.'
    )
  })

  it('refuses an empty list', () => {
    expect(approvalProblem([])).toMatch(/at least one field/)
  })
})
