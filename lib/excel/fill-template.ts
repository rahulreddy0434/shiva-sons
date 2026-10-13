import ExcelJS from 'exceljs'
import type { ExtractionField } from '@/types/extraction'
import { isValidDate, isValidNumber } from '@/lib/validation/validate-record'

export interface ExportColumn {
  fieldKey: string
  /** Zero-based column position in the worksheet, as stored in workbook_columns.column_index. */
  columnIndex: number
  dataType: ExtractionField['dataType']
}

export interface FillTemplateInput {
  template: Buffer
  sheetName: string
  /** Zero-based row position of the header row. */
  headerRowIndex: number
  columns: ExportColumn[]
  /** One entry per approved record: field key → value. */
  records: Record<string, string | null>[]
}

export interface FillTemplateResult {
  buffer: Buffer
  /** One-based worksheet row the first record was written to. */
  firstRow: number
  rowsWritten: number
  /** Cells left alone because the template has a formula there (e.g. a row total). */
  formulaCellsKept: number
}

function hasFormula(cell: ExcelJS.Cell): boolean {
  return cell.type === ExcelJS.ValueType.Formula
}

function isBlank(cell: ExcelJS.Cell): boolean {
  const value = cell.value
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

/** Writes numbers as numbers and dates as dates so Excel can calculate with them. */
function toCellValue(value: string | null, dataType: ExtractionField['dataType']): ExcelJS.CellValue {
  if (value === null || value.trim() === '') return null
  const trimmed = value.trim()
  if (dataType === 'number' && isValidNumber(trimmed)) return Number(trimmed)
  if (dataType === 'date' && isValidDate(trimmed)) return new Date(`${trimmed}T00:00:00.000Z`)
  return trimmed
}

function sameValue(written: ExcelJS.CellValue, expected: ExcelJS.CellValue): boolean {
  if (expected instanceof Date) return written instanceof Date && written.getTime() === expected.getTime()
  return (written ?? null) === (expected ?? null)
}

/**
 * Fills a copy of the customer's workbook with approved records.
 *
 * - Rows are appended below the last row that already holds data in the
 *   mapped columns, so existing records are never overwritten.
 * - A cell that holds a formula in the template (such as a row total) is
 *   left as it is; Excel recalculates it when the file is opened.
 * - Only the mapped cells are touched. Other sheets, columns, styles and
 *   formulas pass through untouched as far as ExcelJS preserves them
 *   (macros, pivot tables and charts are not supported).
 * - The result is reopened and checked cell by cell before it is returned.
 */
export async function fillTemplate(input: FillTemplateInput): Promise<FillTemplateResult> {
  const { template, sheetName, headerRowIndex, columns, records } = input
  if (columns.length === 0) throw new Error('No fields are mapped to template columns.')

  const workbook = new ExcelJS.Workbook()
  // ExcelJS's Buffer typing lags behind Node's
  await workbook.xlsx.load(template as unknown as ArrayBuffer)
  const sheet = workbook.getWorksheet(sheetName)
  if (!sheet) throw new Error(`The template has no worksheet named "${sheetName}".`)

  const headerRow = headerRowIndex + 1

  // Last row that already has typed-in data in any mapped column
  let lastDataRow = headerRow
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const hasData = columns.some((c) => {
      const cell = row.getCell(c.columnIndex + 1)
      return !hasFormula(cell) && !isBlank(cell)
    })
    if (hasData) lastDataRow = r
  }
  const firstRow = lastDataRow + 1

  let formulaCellsKept = 0
  const expected: { row: number; column: number; value: ExcelJS.CellValue }[] = []

  records.forEach((record, index) => {
    const row = sheet.getRow(firstRow + index)
    for (const column of columns) {
      const cell = row.getCell(column.columnIndex + 1)
      if (hasFormula(cell)) {
        formulaCellsKept++
        continue
      }
      const value = toCellValue(record[column.fieldKey] ?? null, column.dataType)
      cell.value = value
      expected.push({ row: firstRow + index, column: column.columnIndex + 1, value })
    }
    row.commit()
  })

  // Cached formula results are stale now; have Excel recalculate on open
  workbook.calcProperties.fullCalcOnLoad = true

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

  // Prove the file reopens and holds exactly what was approved
  const check = new ExcelJS.Workbook()
  await check.xlsx.load(buffer as unknown as ArrayBuffer)
  const checkSheet = check.getWorksheet(sheetName)
  if (!checkSheet) throw new Error('The generated workbook could not be verified: worksheet missing.')
  for (const cell of expected) {
    const written = checkSheet.getRow(cell.row).getCell(cell.column).value
    if (!sameValue(written, cell.value)) {
      throw new Error(`The generated workbook could not be verified: row ${cell.row}, column ${cell.column} does not match.`)
    }
  }

  return { buffer, firstRow, rowsWritten: records.length, formulaCellsKept }
}
