import type { ExtractionField } from '@/types/extraction'

function toKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function guessType(label: string): ExtractionField['dataType'] {
  const l = label.toLowerCase()
  if (l.includes('date')) return 'date'
  if (l.includes('time') && !l.includes('overtime')) return 'time'
  if (l.includes('break') || l.includes('duration')) return 'duration'
  if (l.includes('hours') || l.includes('id') || l.includes('number')) return 'number'
  return 'string'
}

/**
 * Builds a starting field list straight from the workbook's own column
 * names. Used both as the "suggested instruction" fallback (§7 of the
 * spec) and as the schema when the user accepts it as-is.
 */
export function buildFieldsFromColumns(columnNames: string[]): ExtractionField[] {
  return columnNames.map((name, index) => ({
    key: toKey(name),
    label: name,
    dataType: guessType(name),
    required: false,
    sortOrder: index,
  }))
}

/**
 * Very simple instruction parser: pulls out comma/and-separated phrases
 * from the free-text instructions as field labels. Good enough for the
 * MVP — Phase 6's LLM step is where real language understanding comes in
 * for the documents themselves; this just needs to produce a reasonable
 * starting field list for the user to edit.
 */
export function buildFieldsFromInstructions(instructions: string): ExtractionField[] {
  const afterExtract = instructions.replace(/^.*?extract\s+/i, '')
  const stopPhrase = afterExtract.split(/\.\s*(do not|don't)/i)[0]

  const parts = stopPhrase
    .split(/,| and /i)
    .map((p) => p.trim())
    .map((p) => p.replace(/^(the|each|every)\s+/i, ''))
    .filter((p) => p.length > 1 && p.length < 40)

  return parts.map((label, index) => ({
    key: toKey(label),
    label: label.replace(/\b\w/g, (c) => c.toUpperCase()),
    dataType: guessType(label),
    required: false,
    sortOrder: index,
  }))
}