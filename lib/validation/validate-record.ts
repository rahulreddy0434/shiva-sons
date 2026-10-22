import type { ExtractionField } from '@/types/extraction'
import { HARD_TO_READ_THRESHOLD } from '@/lib/extraction/read-confidence'

export type IssueSeverity = 'blocking' | 'warning'

export interface FieldIssue {
  fieldKey: string
  type:
    | 'missing'
    | 'invalid_date'
    | 'invalid_time'
    | 'invalid_number'
    | 'invalid_duration'
    | 'ambiguous'
    /** Cells that should add up to a total do not (see cross-checks.ts). */
    | 'math_mismatch'
    /** Another record has the same identifying values (see cross-checks.ts). */
    | 'duplicate'
    /** End before start, or an implausibly long shift (see shift-checks.ts). */
    | 'time_order'
    /** A value outside what is plausible, such as a very long break (see shift-checks.ts). */
    | 'out_of_range'
  severity: IssueSeverity
  message: string
}

/** The parts of a stored extracted value that validation looks at. */
export interface FieldValue {
  value: string | null
  /** The AI's own status for the value; 'user_corrected' once a person has edited it. */
  status?: string | null
  confidence?: number | null
  /** How sure the OCR was about the writing the value came from (see lib/extraction/read-confidence.ts). */
  ocrConfidence?: number | null
}

/** Below this the AI's value is shown as uncertain until a person confirms or corrects it. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7

export function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  // Rejects dates the calendar doesn't have, like 2026-02-30
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function isValidNumber(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value)
}

/** A duration is either a plain number of minutes or H:MM. */
export function isValidDuration(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(value) || /^\d+:[0-5]\d$/.test(value)
}

const FORMAT_CHECKS: Partial<
  Record<ExtractionField['dataType'], { test: (v: string) => boolean; type: FieldIssue['type']; expected: string }>
> = {
  date: { test: isValidDate, type: 'invalid_date', expected: 'a date like 2026-08-15' },
  time: { test: isValidTime, type: 'invalid_time', expected: 'a 24-hour time like 07:30' },
  number: { test: isValidNumber, type: 'invalid_number', expected: 'a plain number like 8 or 7.5' },
  duration: { test: isValidDuration, type: 'invalid_duration', expected: 'minutes (30) or hours and minutes (0:30)' },
}

/**
 * Checks one value against its field definition. Returns at most one issue,
 * the most serious one: a missing required value or a badly formatted value
 * blocks approval; an uncertain AI value is a warning that goes away once a
 * person corrects it.
 */
export function validateField(field: ExtractionField, current: FieldValue | undefined): FieldIssue | null {
  const value = (current?.value ?? '').trim()

  if (!value) {
    if (!field.required) return null
    return {
      fieldKey: field.key,
      type: 'missing',
      severity: 'blocking',
      message: `${field.label} is required but has no value.`,
    }
  }

  const check = FORMAT_CHECKS[field.dataType]
  if (check && !check.test(value)) {
    return {
      fieldKey: field.key,
      type: check.type,
      severity: 'blocking',
      message: `${field.label} should be ${check.expected}.`,
    }
  }

  if (current?.status === 'user_corrected') return null

  if (current?.status === 'ambiguous' || current?.status === 'invalid' || current?.status === 'needs_review') {
    return {
      fieldKey: field.key,
      type: 'ambiguous',
      severity: 'warning',
      message: `${field.label} was hard to read — check it against the document.`,
    }
  }

  // The writing itself was unclear: say so, as that is what to look at on the card
  if (typeof current?.ocrConfidence === 'number' && current.ocrConfidence < HARD_TO_READ_THRESHOLD) {
    return {
      fieldKey: field.key,
      type: 'ambiguous',
      severity: 'warning',
      message: `The writing for ${field.label} was hard to read (${Math.round(current.ocrConfidence * 100)}% sure). Check it against the document.`,
    }
  }

  if (typeof current?.confidence === 'number' && current.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return {
      fieldKey: field.key,
      type: 'ambiguous',
      severity: 'warning',
      message: `${field.label} was read with low confidence (${Math.round(current.confidence * 100)}%) — check it against the document.`,
    }
  }

  return null
}

export function validateRecord(
  fields: ExtractionField[],
  values: Record<string, FieldValue | undefined>
): FieldIssue[] {
  const issues: FieldIssue[] = []
  for (const field of fields) {
    const issue = validateField(field, values[field.key])
    if (issue) issues.push(issue)
  }
  return issues
}

export type ReviewState = 'needs_attention' | 'reviewed' | 'ready'

/**
 * Where a record stands for the reviewer. Blocking issues always need
 * attention, even on a record someone already marked reviewed. Warnings need
 * attention until the record is marked reviewed.
 */
export function reviewState(issues: FieldIssue[], reviewed: boolean): ReviewState {
  if (issues.some((i) => i.severity === 'blocking')) return 'needs_attention'
  if (reviewed) return 'reviewed'
  return issues.length > 0 ? 'needs_attention' : 'ready'
}
