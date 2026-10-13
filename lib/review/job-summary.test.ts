import { describe, expect, it } from 'vitest'
import { approvalBlockers, resolveExportColumns, summarizeRecords, type MappableField } from './job-summary'

const fields: MappableField[] = [
  { key: 'id', label: 'ID', dataType: 'string', required: true, sortOrder: 0 },
  { key: 'hours', label: 'Hours', dataType: 'number', required: false, sortOrder: 1 },
]

const clean = { id: { value: '1', status: 'extracted', confidence: 0.9 }, hours: { value: '8', status: 'extracted', confidence: 0.9 } }
const withId = (id: string) => ({ ...clean, id: { value: id, status: 'extracted', confidence: 0.9 } })

describe('summarizeRecords', () => {
  it('counts each record in exactly one review bucket', () => {
    const summary = summarizeRecords(fields, [
      { id: 'a', reviewed: true, values: withId('1') },
      { id: 'b', reviewed: false, values: withId('2') },
      { id: 'c', reviewed: false, values: { ...clean, id: { value: null, status: 'missing' } } },
      { id: 'd', reviewed: false, values: { ...withId('4'), hours: { value: '8', status: 'ambiguous', confidence: 0.3 } } },
      { id: 'e', reviewed: true, values: { ...withId('5'), hours: { value: 'x', status: 'extracted', confidence: 0.9 } } },
    ])

    expect(summary).toMatchObject({
      recordCount: 5,
      reviewedCount: 1,
      notReviewedCount: 1,
      blockingRecordCount: 2, // includes the one marked reviewed but now invalid
      warningRecordCount: 1,
    })
    expect(
      summary.reviewedCount + summary.notReviewedCount + summary.blockingRecordCount + summary.warningRecordCount
    ).toBe(summary.recordCount)
  })

  it('counts a record as corrected when any value was changed by a person', () => {
    const summary = summarizeRecords(fields, [
      { id: 'a', reviewed: true, values: { ...withId('1'), hours: { value: '9', status: 'user_corrected' } } },
      { id: 'b', reviewed: true, values: withId('2') },
    ])
    expect(summary.correctedCount).toBe(1)
  })

  it('holds possible duplicates for attention until someone marks them reviewed', () => {
    const open = summarizeRecords(fields, [
      { id: 'a', reviewed: false, values: withId('7') },
      { id: 'b', reviewed: false, values: withId('7') },
    ])
    expect(open).toMatchObject({ warningRecordCount: 2, notReviewedCount: 0 })

    const confirmed = summarizeRecords(fields, [
      { id: 'a', reviewed: true, values: withId('7') },
      { id: 'b', reviewed: true, values: withId('7') },
    ])
    expect(confirmed).toMatchObject({ warningRecordCount: 0, reviewedCount: 2 })
  })
})

describe('approvalBlockers', () => {
  const base = { recordCount: 3, correctedCount: 0, blockingRecordCount: 0, warningRecordCount: 0, notReviewedCount: 1, reviewedCount: 2 }

  it('allows approval when nothing needs attention, even with unreviewed clean records', () => {
    expect(approvalBlockers(base, 5)).toEqual([])
  })

  it('blocks on blocking issues, unconfirmed warnings, no records and no mapped columns', () => {
    expect(approvalBlockers({ ...base, blockingRecordCount: 1 }, 5)).toHaveLength(1)
    expect(approvalBlockers({ ...base, warningRecordCount: 2 }, 5)).toHaveLength(1)
    expect(approvalBlockers({ ...base, recordCount: 0 }, 5)).toHaveLength(1)
    expect(approvalBlockers(base, 0)).toHaveLength(1)
    expect(approvalBlockers({ ...base, blockingRecordCount: 1, warningRecordCount: 1 }, 0)).toHaveLength(3)
  })
})

describe('resolveExportColumns', () => {
  const sheet = [
    { id: 'c-id', name: 'ID', index: 0 },
    { id: 'c-name', name: 'NAME', index: 1 },
    { id: 'c-1', name: '1', index: 4 },
  ]

  it('writes each field to the column it is linked to, whatever its label', () => {
    const { columns, unmapped } = resolveExportColumns(
      [
        { key: 'emp', label: 'Employee number', dataType: 'string', required: true, sortOrder: 0, targetColumnId: 'c-id' },
        { key: 'name', label: 'Worker', dataType: 'string', required: true, sortOrder: 1, targetColumnId: 'c-name' },
        { key: 'day_1', label: '1', dataType: 'number', required: false, sortOrder: 2, targetColumnId: 'c-1' },
      ],
      sheet
    )
    expect(columns).toEqual([
      { fieldKey: 'emp', columnIndex: 0, dataType: 'string' },
      { fieldKey: 'name', columnIndex: 1, dataType: 'string' },
      { fieldKey: 'day_1', columnIndex: 4, dataType: 'number' },
    ])
    expect(unmapped).toEqual([])
  })

  it('leaves out a field the user unlinked, even if a header has the same name', () => {
    const { columns, unmapped } = resolveExportColumns(
      [{ key: 'name', label: 'NAME', dataType: 'string', required: true, sortOrder: 0, targetColumnId: null }],
      sheet
    )
    expect(columns).toEqual([])
    expect(unmapped).toEqual(['NAME'])
  })

  it('reports fields with no column, including a link to a column on another sheet', () => {
    const { columns, unmapped } = resolveExportColumns(
      [
        { key: 'site', label: 'Site', dataType: 'string', required: false, sortOrder: 0 },
        { key: 'x', label: 'X', dataType: 'string', required: false, sortOrder: 1, targetColumnId: 'other-sheet-col' },
      ],
      sheet
    )
    expect(columns).toEqual([])
    expect(unmapped).toEqual(['Site', 'X'])
  })

  it('never maps two fields to the same column', () => {
    const { columns, unmapped } = resolveExportColumns(
      [
        { key: 'a', label: 'ID', dataType: 'string', required: false, sortOrder: 0, targetColumnId: 'c-id' },
        { key: 'b', label: 'Id', dataType: 'string', required: false, sortOrder: 1, targetColumnId: 'c-id' },
      ],
      sheet
    )
    expect(columns.map((c) => c.fieldKey)).toEqual(['a'])
    expect(unmapped).toEqual(['Id'])
  })
})
