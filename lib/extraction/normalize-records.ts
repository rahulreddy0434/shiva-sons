import type { ExtractionField } from '@/types/extraction'

export type ExtractedStatus = 'extracted' | 'missing' | 'ambiguous' | 'invalid'

export interface NormalizedFieldResult {
  fieldKey: string
  value: string | null
  confidence: number | null
  status: ExtractedStatus
}

const STATUSES: ExtractedStatus[] = ['extracted', 'missing', 'ambiguous', 'invalid']

/**
 * Turns whatever the model returned for one record into exactly one clean
 * result per schema field. The model's output is untrusted: unknown keys are
 * dropped, absent or malformed fields become "missing" rather than being
 * guessed, and nothing here ever makes up a value.
 */
export function normalizeRecord(raw: unknown, fields: ExtractionField[]): NormalizedFieldResult[] {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}

  return fields.map((field) => {
    const entry = source[field.key]
    // Accept both { value, confidence, status } and a bare value
    const wrapped = entry && typeof entry === 'object' && !Array.isArray(entry)
    const rawValue = wrapped ? (entry as Record<string, unknown>).value : entry
    const rawConfidence = wrapped ? (entry as Record<string, unknown>).confidence : undefined
    const rawStatus = wrapped ? (entry as Record<string, unknown>).status : undefined

    let value: string | null = null
    if (typeof rawValue === 'string') value = rawValue.trim() || null
    else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) value = String(rawValue)
    else if (typeof rawValue === 'boolean') value = String(rawValue)

    const confidence =
      typeof rawConfidence === 'number' && Number.isFinite(rawConfidence)
        ? Math.min(1, Math.max(0, rawConfidence))
        : null

    let status: ExtractedStatus = STATUSES.includes(rawStatus as ExtractedStatus)
      ? (rawStatus as ExtractedStatus)
      : value === null
        ? 'missing'
        : 'ambiguous' // a value with no usable status is not treated as confirmed

    // The two must agree: no value is always "missing"; a value is never "missing"
    if (value === null) status = 'missing'
    else if (status === 'missing') status = 'ambiguous'

    return { fieldKey: field.key, value, confidence, status }
  })
}

/** A record where the model found nothing at all is noise, not a record. */
export function isEmptyRecord(results: NormalizedFieldResult[]): boolean {
  return results.every((r) => r.value === null)
}
