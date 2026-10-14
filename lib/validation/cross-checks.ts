import type { ExtractionField } from '@/types/extraction'
import { groupFields } from '@/lib/review/group-fields'
import { isValidNumber, validateRecord, type FieldIssue, type FieldValue } from './validate-record'
import { shiftIssues } from './shift-checks'
import { DEFAULT_CHECK_POLICY, type CheckPolicy } from './check-policy'
import { isDayOfMonthHeader } from '@/lib/extraction/suggested-instructions'

export interface CheckableRecord {
  id: string
  values: Record<string, FieldValue | undefined>
}

/** A label that reads like the total of the cells before it: "T/HRS", "Total hours", "Hrs". */
const TOTAL_LABEL = /total|t\s*\/?\s*hrs|\bhrs\b|\bhours\b/i


function numberOf(value: FieldValue | undefined): number | null | 'invalid' {
  const text = (value?.value ?? '').trim()
  if (text === '') return null
  return isValidNumber(text) ? Number(text) : 'invalid'
}

/**
 * Pairs each run of numeric cells (a month of day columns) with the total
 * column that directly follows it, when there is one.
 */
export function findSeriesTotals(fields: ExtractionField[]): { cells: ExtractionField[]; total: ExtractionField }[] {
  const groups = groupFields(fields)
  const pairs: { cells: ExtractionField[]; total: ExtractionField }[] = []

  groups.forEach((group, index) => {
    if (group.kind !== 'series' || group.fields[0].dataType !== 'number') return
    const next = groups[index + 1]
    // A total typed as text still holds a number on most cards; a non-numeric value is skipped below
    const numericTotal = next?.kind === 'single' && (next.field.dataType === 'number' || next.field.dataType === 'string')
    if (numericTotal && TOTAL_LABEL.test(next.field.label)) {
      pairs.push({ cells: group.fields, total: next.field })
    }
  })

  return pairs
}

/** Flags a total that disagrees with the cells it should be the sum of. */
function totalMismatch(fields: ExtractionField[], record: CheckableRecord, policy: CheckPolicy): FieldIssue[] {
  const issues: FieldIssue[] = []

  for (const { cells, total } of findSeriesTotals(fields)) {
    const stated = numberOf(record.values[total.key])
    if (stated === null || stated === 'invalid') continue

    const numbers = cells.map((cell) => numberOf(record.values[cell.key]))
    // A badly formatted cell is already reported on that cell
    if (numbers.includes('invalid')) continue

    const sum = (numbers as (number | null)[]).reduce<number>((a, b) => a + (b ?? 0), 0)
    // Differences within the job's tolerance are rounding, not a mismatch
    if (Math.abs(sum - stated) > Math.max(policy.toleranceHours, 0.005)) {
      const first = cells[0].label
      const last = cells[cells.length - 1].label
      issues.push({
        fieldKey: total.key,
        type: 'math_mismatch',
        severity: 'warning',
        message: `${total.label} is ${stated}, but columns ${first}–${last} add up to ${Math.round(sum * 100) / 100}. Check both against the document.`,
      })
    }
  }

  return issues
}

/** Flags a day cell holding more hours than anyone works in one day. */
function dayLimit(fields: ExtractionField[], record: CheckableRecord, policy: CheckPolicy): FieldIssue[] {
  const issues: FieldIssue[] = []
  for (const group of groupFields(fields)) {
    if (group.kind !== 'series' || group.fields[0].dataType !== 'number') continue
    if (!group.fields.every((f) => isDayOfMonthHeader(f.label))) continue
    for (const field of group.fields) {
      const value = numberOf(record.values[field.key])
      if (typeof value === 'number' && value > policy.maxHoursPerDay) {
        issues.push({
          fieldKey: field.key,
          type: 'out_of_range',
          severity: 'warning',
          message: `${value} hours is more than the ${policy.maxHoursPerDay} allowed in one day. Check it against the document.`,
        })
      }
    }
  }
  return issues
}

/**
 * Finds records that share every identifying (required) value — usually the
 * same card uploaded twice. Records with any identifying value missing are
 * left out: that is already a blocking issue of its own.
 */
function duplicates(fields: ExtractionField[], records: CheckableRecord[]): Map<string, FieldIssue> {
  const identifying = fields.filter((f) => f.required)
  const found = new Map<string, FieldIssue>()
  if (identifying.length === 0) return found

  const byIdentity = new Map<string, string[]>()
  for (const record of records) {
    const parts = identifying.map((f) => (record.values[f.key]?.value ?? '').trim().toLowerCase())
    if (parts.some((p) => p === '')) continue
    const identity = JSON.stringify(parts)
    byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), record.id])
  }

  const labels = identifying.map((f) => f.label).join(' and ')
  for (const ids of byIdentity.values()) {
    if (ids.length < 2) continue
    for (const id of ids) {
      found.set(id, {
        fieldKey: identifying[0].key,
        type: 'duplicate',
        severity: 'warning',
        message: `${ids.length - 1} other record${ids.length === 2 ? ' has' : 's have'} the same ${labels}. Check that a document was not uploaded twice.`,
      })
    }
  }

  return found
}

/**
 * Every issue for every record: the per-field checks plus the checks that
 * need the whole record or the whole job. A field keeps at most one issue,
 * and a field's own problem (missing, bad format) takes priority.
 */
export function validateRecords(
  fields: ExtractionField[],
  records: CheckableRecord[],
  policy: CheckPolicy = DEFAULT_CHECK_POLICY
): Map<string, FieldIssue[]> {
  const duplicateIssues = duplicates(fields, records)
  const result = new Map<string, FieldIssue[]>()

  for (const record of records) {
    const issues = validateRecord(fields, record.values)
    const taken = new Set(issues.map((i) => i.fieldKey))

    const extra = [
      ...totalMismatch(fields, record, policy),
      ...dayLimit(fields, record, policy),
      ...shiftIssues(fields, record.values, policy),
    ]
    const duplicate = duplicateIssues.get(record.id)
    if (duplicate) extra.push(duplicate)

    for (const issue of extra) {
      if (taken.has(issue.fieldKey)) continue
      taken.add(issue.fieldKey)
      issues.push(issue)
    }
    result.set(record.id, issues)
  }

  return result
}
