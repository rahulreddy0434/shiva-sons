import type { ExtractionField } from '@/types/extraction'
import { MOCK_LABEL } from '@/lib/mock/mode'
import { isDayOfMonthHeader } from '@/lib/extraction/suggested-instructions'
import { guessType } from '@/lib/extraction/guess-type'
import type { ExtractionPage, WorkbookSheetSummary } from './prompts'
import type { ExtractedRecord, ProposedField } from './provider'

const TYPE_BY_INFERRED: Record<string, ExtractionField['dataType']> = {
  date: 'date',
  time: 'time',
  duration: 'duration',
  number: 'number',
}

/** Mock field proposal: one field per template column, no language understanding. */
export function mockProposeSchemaFields(sheets: WorkbookSheetSummary[]): ProposedField[] {
  const sheet = sheets.find((s) => s.columns.length > 0)
  if (!sheet) return []

  return sheet.columns.map((column, index) => {
    const day = isDayOfMonthHeader(column.name)
    return {
      key: day ? `day_${column.name.trim()}` : column.name,
      label: column.name,
      dataType: day ? 'number' : (TYPE_BY_INFERRED[column.inferredType] ?? guessType(column.name)),
      required: index < 2 && !day,
      column: column.name,
    }
  })
}

const MOCK_VALUE: Record<ExtractionField['dataType'], (field: ExtractionField) => string> = {
  string: (field) => `${MOCK_LABEL} ${field.label}`,
  number: () => '8',
  date: () => '2026-01-01',
  time: () => '08:00',
  duration: () => '30',
}

/**
 * Mock extraction: one record per document, every value fake and reported
 * with low confidence so Review flags all of it as needing a human check.
 */
export function mockExtractStructuredData(fields: ExtractionField[], pages: ExtractionPage[]): ExtractedRecord[] {
  return [
    {
      page: pages[0]?.pageNumber ?? 1,
      fields: Object.fromEntries(
        fields.map((field) => [
          field.key,
          { value: MOCK_VALUE[field.dataType](field), confidence: 0.5, status: 'ambiguous' },
        ])
      ),
    },
  ]
}
