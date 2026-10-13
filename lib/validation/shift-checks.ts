import type { ExtractionField } from '@/types/extraction'
import { isValidDuration, isValidNumber, isValidTime, type FieldIssue, type FieldValue } from './validate-record'

/**
 * How start / end / break / total are checked against each other. These are
 * checks, not payroll rules: nothing is recalculated or changed, a mismatch
 * is only pointed out for a person to decide.
 */
export interface ShiftPolicy {
  /** A shift longer than this is flagged as unlikely. */
  maxShiftHours: number
  /** A break longer than this is flagged as unlikely. */
  maxBreakMinutes: number
  /** Round the expected hours to this many minutes before comparing (null = no rounding). */
  roundToMinutes: number | null
  /** How far the stated total may be from the expected hours before it is flagged. */
  toleranceHours: number
}

export const DEFAULT_SHIFT_POLICY: ShiftPolicy = {
  maxShiftHours: 16,
  maxBreakMinutes: 180,
  roundToMinutes: null,
  toleranceHours: 0.02,
}

export interface ShiftFields {
  start: ExtractionField
  end: ExtractionField
  breakDuration?: ExtractionField
  total?: ExtractionField
}

const START = /\b(start|begin|time in|clock in|in time|sign in)\b/i
const END = /\b(end|finish|time out|clock out|out time|sign out)\b/i
const BREAK = /\b(break|lunch|rest)\b/i
const TOTAL = /\btotal\b/i
const OVERTIME = /over\s*time|\bot\b/i

/** Finds the start, end, break and total fields of a clock-in/clock-out style card, if it is one. */
export function detectShiftFields(fields: ExtractionField[]): ShiftFields | null {
  const times = fields.filter((f) => f.dataType === 'time')
  const start = times.find((f) => START.test(f.label))
  const end = times.find((f) => END.test(f.label) && f !== start)
  if (!start || !end) return null

  return {
    start,
    end,
    breakDuration: fields.find((f) => f.dataType === 'duration' && BREAK.test(f.label)),
    total: fields.find((f) => f.dataType === 'number' && TOTAL.test(f.label) && !OVERTIME.test(f.label)),
  }
}

function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** A duration is stored as plain minutes ("30") or hours and minutes ("0:30"). */
export function durationMinutes(value: string): number {
  if (value.includes(':')) {
    const [hours, minutes] = value.split(':').map(Number)
    return hours * 60 + minutes
  }
  return Number(value)
}

/**
 * Minutes between start and end. An end at or before the start is read as
 * finishing the next day, which is how an overnight shift is written.
 */
export function shiftMinutes(start: string, end: string): { minutes: number; overnight: boolean } {
  const from = minutesOfDay(start)
  const to = minutesOfDay(end)
  return to > from ? { minutes: to - from, overnight: false } : { minutes: to + 24 * 60 - from, overnight: true }
}

export function expectedHours(start: string, end: string, breakMinutes: number, policy: ShiftPolicy): number {
  let minutes = shiftMinutes(start, end).minutes - breakMinutes
  if (policy.roundToMinutes) minutes = Math.round(minutes / policy.roundToMinutes) * policy.roundToMinutes
  return minutes / 60
}

const text = (value: FieldValue | undefined) => (value?.value ?? '').trim()
const formatHours = (hours: number) => String(Math.round(hours * 100) / 100)

/**
 * Checks a record's start, end, break and total against each other. Returns
 * warnings only, each on the field most likely to be wrong. Values that are
 * missing or badly formatted are skipped — those have their own messages.
 */
export function shiftIssues(
  fields: ExtractionField[],
  values: Record<string, FieldValue | undefined>,
  policy: ShiftPolicy = DEFAULT_SHIFT_POLICY
): FieldIssue[] {
  const shift = detectShiftFields(fields)
  if (!shift) return []

  const start = text(values[shift.start.key])
  const end = text(values[shift.end.key])
  if (!isValidTime(start) || !isValidTime(end)) return []

  const issues: FieldIssue[] = []
  const { minutes, overnight } = shiftMinutes(start, end)

  if (minutes > policy.maxShiftHours * 60) {
    issues.push({
      fieldKey: shift.end.key,
      type: 'time_order',
      severity: 'warning',
      message: overnight
        ? `${shift.end.label} (${end}) is before ${shift.start.label} (${start}). Read as an overnight shift that would be ${formatHours(minutes / 60)} hours — check the times.`
        : `${shift.start.label} to ${shift.end.label} is ${formatHours(minutes / 60)} hours, longer than ${policy.maxShiftHours}. Check the times.`,
    })
  } else if (overnight) {
    issues.push({
      fieldKey: shift.end.key,
      type: 'time_order',
      severity: 'warning',
      message: `${shift.end.label} (${end}) is before ${shift.start.label} (${start}). Treated as an overnight shift of ${formatHours(minutes / 60)} hours — confirm that is right.`,
    })
  }

  let breakMinutes = 0
  if (shift.breakDuration) {
    const breakText = text(values[shift.breakDuration.key])
    if (breakText !== '') {
      if (!isValidDuration(breakText)) return issues
      breakMinutes = durationMinutes(breakText)
      if (breakMinutes >= minutes) {
        issues.push({
          fieldKey: shift.breakDuration.key,
          type: 'out_of_range',
          severity: 'warning',
          message: `${shift.breakDuration.label} (${breakText}) is as long as the whole shift. Check it against the document.`,
        })
        return issues
      }
      if (breakMinutes > policy.maxBreakMinutes) {
        issues.push({
          fieldKey: shift.breakDuration.key,
          type: 'out_of_range',
          severity: 'warning',
          message: `${shift.breakDuration.label} is ${formatHours(breakMinutes / 60)} hours, longer than usual. Check it against the document.`,
        })
      }
    }
  }

  if (shift.total) {
    const totalText = text(values[shift.total.key])
    if (isValidNumber(totalText)) {
      const expected = expectedHours(start, end, breakMinutes, policy)
      if (Math.abs(expected - Number(totalText)) > policy.toleranceHours) {
        issues.push({
          fieldKey: shift.total.key,
          type: 'math_mismatch',
          severity: 'warning',
          message: `${shift.total.label} is ${totalText}, but ${start} to ${end}${
            breakMinutes > 0 ? ` less a ${breakMinutes}-minute break` : ''
          } is ${formatHours(expected)} hours. Check both against the document.`,
        })
      }
    }
  }

  return issues
}
