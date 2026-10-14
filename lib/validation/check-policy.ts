import { DEFAULT_SHIFT_POLICY, type ShiftPolicy } from './shift-checks'

/**
 * The limits a job's records are checked against. They only decide what is
 * flagged for a person to look at; nothing is ever recalculated or changed.
 * Stored per job in `extraction_jobs.check_policy` (null = these defaults).
 */
export interface CheckPolicy extends ShiftPolicy {
  /** A day cell (hours worked on one day) above this is flagged as unlikely. */
  maxHoursPerDay: number
}

export const DEFAULT_CHECK_POLICY: CheckPolicy = {
  ...DEFAULT_SHIFT_POLICY,
  maxHoursPerDay: 16,
}

/** Rounding choices offered on screen, in minutes; null is no rounding. */
export const ROUNDING_CHOICES: (number | null)[] = [null, 5, 6, 10, 15, 30]

const LIMITS: Record<Exclude<keyof CheckPolicy, 'roundToMinutes'>, { min: number; max: number; label: string }> = {
  maxHoursPerDay: { min: 1, max: 24, label: 'Most hours in one day' },
  maxShiftHours: { min: 1, max: 24, label: 'Longest shift (hours)' },
  maxBreakMinutes: { min: 0, max: 720, label: 'Longest break (minutes)' },
  toleranceHours: { min: 0, max: 5, label: 'Allowed difference for totals (hours)' },
}

/**
 * Reads a stored policy. Anything missing or unusable falls back to the
 * default for that setting, so an old or damaged value never breaks review.
 */
export function readCheckPolicy(raw: unknown): CheckPolicy {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const policy: CheckPolicy = { ...DEFAULT_CHECK_POLICY }
  for (const [key, { min, max }] of Object.entries(LIMITS) as [keyof typeof LIMITS, (typeof LIMITS)[keyof typeof LIMITS]][]) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max) policy[key] = value
  }
  if (source.roundToMinutes === null || ROUNDING_CHOICES.includes(source.roundToMinutes as number)) {
    policy.roundToMinutes = (source.roundToMinutes as number | null | undefined) ?? null
  }
  return policy
}

/** Checks settings sent from the screen. Returns the policy, or a message naming the setting that is wrong. */
export function parseCheckPolicyInput(input: unknown): { policy: CheckPolicy } | { error: string } {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : null
  if (!source) return { error: 'Missing settings' }

  const policy: CheckPolicy = { ...DEFAULT_CHECK_POLICY }
  for (const [key, { min, max, label }] of Object.entries(LIMITS) as [keyof typeof LIMITS, (typeof LIMITS)[keyof typeof LIMITS]][]) {
    const value = Number(source[key])
    if (source[key] === '' || source[key] === null || !Number.isFinite(value) || value < min || value > max) {
      return { error: `${label} must be a number from ${min} to ${max}.` }
    }
    policy[key] = value
  }
  const rounding = source.roundToMinutes === null || source.roundToMinutes === '' ? null : Number(source.roundToMinutes)
  if (!ROUNDING_CHOICES.includes(rounding)) return { error: 'Choose one of the rounding options.' }
  policy.roundToMinutes = rounding
  return { policy }
}
