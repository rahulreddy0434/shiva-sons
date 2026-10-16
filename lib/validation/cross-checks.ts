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

/** A label naming who a record is about: "ID", "Employee Number", "Name", "Emp #". */
const IDENTITY_LABEL = /\b(id|name|employee|emp|staff|worker|badge|number|no)\b|#/i
/** A label naming the period a record covers: "Week Ending", "Month", "Pay date". */
const PERIOD_LABEL = /week|month|period|ending|date/i
/** Fewer filled values than this and two records matching says nothing. */
const MIN_VALUES_FOR_COPY = 3

/**
 * The fields that tell one record from another: the required ones when the
 * user marked any, otherwise the ones whose names read like an identifier,
 * together with any period field (so the same person's different weeks differ).
 */
export function identifyingFields(fields: ExtractionField[]): ExtractionField[] {
  const required = fields.filter((f) => f.required)
  if (required.length > 0) return required

  const singles = groupFields(fields).flatMap((g) => (g.kind === 'single' ? [g.field] : []))
  const who = singles.filter((f) => IDENTITY_LABEL.test(f.label))
  if (who.length === 0) return []
  return [...who, ...singles.filter((f) => !who.includes(f) && PERIOD_LABEL.test(f.label))]
}

const normalized = (value: FieldValue | undefined) => (value?.value ?? '').trim().toLowerCase()

/**
 * Finds records that look like the same card twice: every value identical, or
 * every identifying value the same. Records with an identifying value missing
 * are left out of the second test: that is already an issue of its own.
 */
function duplicates(fields: ExtractionField[], records: CheckableRecord[]): Map<string, FieldIssue> {
  const found = new Map<string, FieldIssue>()
  const identifying = identifyingFields(fields)

  // Exact copies, whatever the fields are called
  const byContent = new Map<string, string[]>()
  for (const record of records) {
    const parts = fields.map((f) => normalized(record.values[f.key]))
    if (parts.filter((p) => p !== '').length < MIN_VALUES_FOR_COPY) continue
    const content = JSON.stringify(parts)
    byContent.set(content, [...(byContent.get(content) ?? []), record.id])
  }
  const anchor = identifying[0] ?? fields[0]
  for (const ids of byContent.values()) {
    if (ids.length < 2) continue
    for (const id of ids) {
      found.set(id, {
        fieldKey: anchor.key,
        type: 'duplicate',
        severity: 'warning',
        message: `${ids.length - 1} other record${ids.length === 2 ? ' has' : 's have'} exactly the same values. The same card was probably uploaded twice; remove the extra copy.`,
      })
    }
  }

  if (identifying.length === 0) return found
  const byIdentity = new Map<string, string[]>()
  for (const record of records) {
    const parts = identifying.map((f) => normalized(record.values[f.key]))
    if (parts.some((p) => p === '')) continue
    const identity = JSON.stringify(parts)
    byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), record.id])
  }

  const labels = identifying.map((f) => f.label).join(' and ')
  for (const ids of byIdentity.values()) {
    if (ids.length < 2) continue
    for (const id of ids) {
      // An exact copy keeps its plainer message
      if (found.has(id)) continue
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
