import type { ExtractionField } from '@/types/extraction'
import { proposeSchemaFields } from '@/lib/llm/provider'
import type { WorkbookSheetSummary } from '@/lib/llm/prompts'
import { guessType } from './guess-type'
import { isDayOfMonthHeader } from './suggested-instructions'
import { findSeriesTotals } from '@/lib/validation/cross-checks'

/**
 * A total that follows a run of number cells holds a number. A text type
 * would put it into Excel as text, where sums skip it, so it is set here
 * rather than left to the model.
 */
function numericTotals(fields: ExtractionField[]): ExtractionField[] {
  const totals = new Set(findSeriesTotals(fields).map((pair) => pair.total.key))
  return fields.map((f) => (totals.has(f.key) ? { ...f, dataType: 'number' } : f))
}

function toKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const TYPE_FROM_SAMPLE: Record<string, ExtractionField['dataType']> = {
  date: 'date',
  time: 'time',
  duration: 'duration',
  number: 'number',
}

/**
 * Builds the field list straight from the template's columns, one field per
 * column, without any AI: for when the user just wants their columns filled,
 * or the AI service is unavailable. Types come from the column's sample data
 * where the template has some, otherwise from its name; day-of-month columns
 * are numbers. Required or Optional is left for the user to choose in Step 2.
 */
export function buildFieldsFromColumns(sheets: WorkbookSheetSummary[]): ExtractionField[] {
  // One worksheet only: the first that has headings
  const sheet = sheets.find((s) => s.columns.length > 0)
  if (!sheet) return []

  const usedKeys = new Set<string>()
  return sheet.columns.map((column, index) => {
    const day = isDayOfMonthHeader(column.name)
    const baseKey = (day ? `day_${column.name.trim()}` : toKey(column.name)) || `field_${index + 1}`
    let key = baseKey
    for (let n = 2; usedKeys.has(key); n++) key = `${baseKey}_${n}`
    usedKeys.add(key)

    return {
      key,
      label: column.name,
      dataType: day ? 'number' : (TYPE_FROM_SAMPLE[column.inferredType] ?? guessType(column.name)),
      required: null,
      sortOrder: index,
      targetColumn: column.name,
    }
  })
}

const DATA_TYPES: ExtractionField['dataType'][] = ['string', 'date', 'time', 'duration', 'number']

/**
 * Asks the LLM to propose a starting field list from the user's
 * instructions plus the workbook's actual columns, so it can reason about
 * what the columns mean (e.g. that columns 1–31 are days of the month, each
 * needing its own value). The model's answer is cleaned up here before
 * anything is saved; the user still edits and approves it.
 */
export async function buildFieldsFromInstructions(
  instructions: string,
  sheets: WorkbookSheetSummary[]
): Promise<ExtractionField[]> {
  const proposed = await proposeSchemaFields({ instructions, sheets })

  const fields: ExtractionField[] = []
  const usedKeys = new Set<string>()
  // Only accept a column the template really has
  const columnNames = new Set(sheets.flatMap((s) => s.columns.map((c) => c.name)))

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
      // The user chooses Required or Optional in Step 2; the AI's opinion is not a choice
      required: null,
      sortOrder: fields.length,
      targetColumn: typeof p.column === 'string' && columnNames.has(p.column) ? p.column : null,
    })
  }

  return numericTotals(fields)
}