import type { ExtractionField } from '@/types/extraction'
import type { NormalizedFieldResult } from './normalize-records'

/**
 * Pages sent to the AI in one call. A document longer than this (a PDF of
 * many cards) is extracted in parts, so no single call or request grows with
 * the size of the upload.
 */
export const PAGES_PER_CALL = 8

/** Consecutive page ranges of at most `size` pages, covering 1…pageCount. */
export function pageBatches(pageCount: number, size: number = PAGES_PER_CALL): { from: number; to: number }[] {
  const batches: { from: number; to: number }[] = []
  for (let from = 1; from <= pageCount; from += size) {
    batches.push({ from, to: Math.min(pageCount, from + size - 1) })
  }
  return batches
}

const same = (a: string | null, b: string | null) =>
  (a ?? '').trim().toLowerCase().replace(/\s+/g, ' ') === (b ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Whether the first record of a part is the same card as the last record of
 * the part before — a card cut in two where the parts meet. It must carry the
 * same value in every identifying (required) field; with no identifying
 * fields, or any of them blank on either side, the two are kept apart.
 */
export function continuesRecord(
  previous: NormalizedFieldResult[],
  next: NormalizedFieldResult[],
  fields: ExtractionField[]
): boolean {
  const identifying = fields.filter((f) => f.required).map((f) => f.key)
  if (identifying.length === 0) return false
  return identifying.every((key) => {
    const a = previous.find((r) => r.fieldKey === key)?.value ?? null
    const b = next.find((r) => r.fieldKey === key)?.value ?? null
    return a !== null && b !== null && same(a, b)
  })
}

/**
 * Combines the two halves of a card. A value found on only one half is
 * taken from it. Where both halves hold different values, the first is kept
 * and marked uncertain so the reviewer checks it — neither is chosen silently.
 */
export function mergeRecords(previous: NormalizedFieldResult[], next: NormalizedFieldResult[]): NormalizedFieldResult[] {
  return previous.map((before) => {
    const after = next.find((r) => r.fieldKey === before.fieldKey)
    if (!after || after.value === null) return before
    if (before.value === null) return after
    if (same(before.value, after.value)) {
      return { ...before, confidence: maxConfidence(before.confidence, after.confidence) }
    }
    return { ...before, status: 'ambiguous', confidence: minConfidence(before.confidence, after.confidence) }
  })
}

function maxConfidence(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.max(a, b)
}

function minConfidence(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.min(a, b)
}
