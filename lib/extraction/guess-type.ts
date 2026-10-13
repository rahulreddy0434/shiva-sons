import type { ExtractionField } from '@/types/extraction'

/** A best guess at a field's type from its name alone. A fallback, never the last word. */
export function guessType(label: string): ExtractionField['dataType'] {
  const l = label.toLowerCase()
  if (l.includes('date')) return 'date'
  if (l.includes('time') && !l.includes('overtime')) return 'time'
  if (l.includes('break') || l.includes('duration')) return 'duration'
  // An ID is text ("E1001", "A-17"), so it is deliberately not treated as a number
  if (l.includes('hours') || l.includes('hrs')) return 'number'
  return 'string'
}
