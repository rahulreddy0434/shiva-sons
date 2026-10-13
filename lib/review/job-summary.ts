import type { ExtractionField } from '@/types/extraction'
import { reviewState, type FieldValue } from '@/lib/validation/validate-record'
import { validateRecords } from '@/lib/validation/cross-checks'
import type { ExportColumn } from '@/lib/excel/fill-template'

export interface SummaryRecord {
  id: string
  reviewed: boolean
  values: Record<string, FieldValue | undefined>
}

export interface JobSummary {
  recordCount: number
  /** Records where a person changed at least one value. */
  correctedCount: number
  /** Records with a missing required value or a badly formatted one. Approval is blocked while this is above zero. */
  blockingRecordCount: number
  /**
   * Records with an unconfirmed warning: an uncertain value, a total that
   * does not add up, or a possible duplicate. Approval is blocked while this
   * is above zero.
   */
  warningRecordCount: number
  /** Clean records nobody has marked reviewed. Allowed, but shown before approval. */
  notReviewedCount: number
  reviewedCount: number
}

export function summarizeRecords(fields: ExtractionField[], records: SummaryRecord[]): JobSummary {
  const summary: JobSummary = {
    recordCount: records.length,
    correctedCount: 0,
    blockingRecordCount: 0,
    warningRecordCount: 0,
    notReviewedCount: 0,
    reviewedCount: 0,
  }

  const issuesByRecord = validateRecords(fields, records)

  for (const record of records) {
    if (Object.values(record.values).some((v) => v?.status === 'user_corrected')) summary.correctedCount++

    const issues = issuesByRecord.get(record.id) ?? []
    const state = reviewState(issues, record.reviewed)
    if (state === 'reviewed') summary.reviewedCount++
    else if (state === 'ready') summary.notReviewedCount++
    else if (issues.some((i) => i.severity === 'blocking')) summary.blockingRecordCount++
    else summary.warningRecordCount++
  }

  return summary
}

/** Approval is only possible when nothing still needs attention. */
export function approvalBlockers(summary: JobSummary, mappedColumnCount: number): string[] {
  const blockers: string[] = []
  if (summary.recordCount === 0) blockers.push('There are no extracted records to approve.')
  if (summary.blockingRecordCount > 0) {
    blockers.push(
      `${summary.blockingRecordCount} record${summary.blockingRecordCount === 1 ? ' has' : 's have'} a missing or badly formatted value (marked ✕ in Review).`
    )
  }
  if (summary.warningRecordCount > 0) {
    blockers.push(
      `${summary.warningRecordCount} record${summary.warningRecordCount === 1 ? ' has' : 's have'} a warning that nobody has confirmed (marked ⚠ in Review). Correct it or mark the record reviewed.`
    )
  }
  if (mappedColumnCount === 0) blockers.push('None of the fields match a column on the chosen worksheet.')
  return blockers
}

export interface SheetColumn {
  id: string
  name: string
  /** Zero-based position in the worksheet. */
  index: number
}

export interface MappableField extends ExtractionField {
  targetColumnId?: string | null
}

/**
 * Decides which worksheet column each field is written to: the column it is
 * linked to in Step 2, and nothing else — what the user sees there is exactly
 * what is exported. Fields with no link on this worksheet are reported so the
 * user knows they will not appear in the export.
 */
export function resolveExportColumns(
  fields: MappableField[],
  sheetColumns: SheetColumn[]
): { columns: ExportColumn[]; unmapped: string[] } {
  const byId = new Map(sheetColumns.map((c) => [c.id, c]))

  const columns: ExportColumn[] = []
  const unmapped: string[] = []
  const used = new Set<number>()

  for (const field of fields) {
    const target = field.targetColumnId ? byId.get(field.targetColumnId) : undefined
    // Two fields must never write to the same cell
    if (!target || used.has(target.index)) {
      unmapped.push(field.label)
      continue
    }
    used.add(target.index)
    columns.push({ fieldKey: field.key, columnIndex: target.index, dataType: field.dataType })
  }

  return { columns, unmapped }
}
