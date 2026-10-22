import type { ExtractionField } from '@/types/extraction'

/**
 * Names that say who a record is about, so a reviewer would want every record
 * to have one: "ID", "Name", "Employee No", "Card Number". A serial number
 * ("SI.NO", "S.No") only numbers the rows and is not suggested.
 */
const IDENTIFIER =
  /^(id|name)$|\b(employee|emp|staff|worker|badge|card)\s*(id|no\.?|number|#|name)(?![a-z])|\b(employee|full)\s*name\b|^(employee|worker)$/i

/** Whether to suggest Required for a field, from its name. Only a suggestion: the user decides. */
export function suggestsRequired(label: string): boolean {
  return IDENTIFIER.test(label.trim())
}

/** Fields the user has not yet set to Required or Optional. */
export function undecidedFields(fields: Pick<ExtractionField, 'label' | 'required'>[]) {
  return fields.filter((f) => f.required !== true && f.required !== false)
}

/** Labels like "1"…"31": the day columns of a monthly card. */
export function isDayField(field: Pick<ExtractionField, 'label'>): boolean {
  return /^\d{1,2}$/.test(field.label.trim())
}

export type BulkChoice = 'days-optional' | 'suggested-required' | 'rest-optional'

/**
 * One click for many fields. Each choice only fills in fields still undecided,
 * so it never overturns something the user set by hand.
 */
export function applyBulkChoice<T extends Pick<ExtractionField, 'label' | 'required'>>(fields: T[], choice: BulkChoice): T[] {
  return fields.map((f) => {
    if (f.required === true || f.required === false) return f
    if (choice === 'days-optional' && isDayField(f)) return { ...f, required: false }
    if (choice === 'suggested-required' && suggestsRequired(f.label)) return { ...f, required: true }
    if (choice === 'rest-optional') return { ...f, required: false }
    return f
  })
}

/** The list with the item at `from` moved to position `to` (drag and drop, or arrow keys). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item)
  return next
}

/** Why the field list cannot be approved yet, or null when it can. */
export function approvalProblem(fields: Pick<ExtractionField, 'label' | 'required'>[]): string | null {
  if (fields.length === 0) return 'Add at least one field before approving.'
  const undecided = undecidedFields(fields)
  if (undecided.length === 0) return null
  const names = undecided.slice(0, 3).map((f) => `“${f.label}”`).join(', ')
  const more = undecided.length > 3 ? ` and ${undecided.length - 3} more` : ''
  return `Choose Required or Optional for every field before approving. Still to choose: ${names}${more}.`
}
