import type { ExtractionField } from '@/types/extraction'
import { proposeSchemaFields } from '@/lib/llm/provider'
import type { WorkbookSheetSummary } from '@/lib/llm/prompts'

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

const DATA_TYPES: ExtractionField['dataType'][] = ['string', 'date', 'time', 'duration', 'number']

/**
 * Asks the LLM to propose a starting field list from the user's
 * instructions plus the workbook's actual columns, so it can reason about
 * what the columns mean (e.g. that day-of-month columns 1–31 are one
 * repeating field, not 31 separate ones). The model's answer is cleaned up
 * here before anything is saved; the user still edits and approves it.
 */
export async function buildFieldsFromInstructions(
  instructions: string,
  sheets: WorkbookSheetSummary[]
): Promise<ExtractionField[]> {
  const proposed = await proposeSchemaFields({ instructions, sheets })

  const fields: ExtractionField[] = []
  const usedKeys = new Set<string>()

  for (const p of proposed) {
    const label = typeof p?.label === 'string' ? p.label.trim() : ''
    if (!label) continue

    const baseKey = toKey(typeof p.key === 'string' && p.key.trim() ? p.key : label) || `field_${fields.length + 1}`
    let key = baseKey
    for (let n = 2; usedKeys.has(key); n++) key = `${baseKey}_${n}`
    usedKeys.add(key)

    fields.push({
      key,
      label,
      dataType: DATA_TYPES.includes(p.dataType as ExtractionField['dataType'])
        ? (p.dataType as ExtractionField['dataType'])
        : guessType(label),
      required: p.required === true,
      sortOrder: fields.length,
    })
  }

  return fields
}