import ExcelJS from 'exceljs'
import type { ParsedWorkbook, ParsedColumn, InferredType } from '@/types/workbook'

/** How far down a sheet to look for the header row. */
const MAX_HEADER_SCAN_ROWS = 20

function inferType(cell: ExcelJS.Cell | undefined): InferredType {
  if (!cell || cell.value == null) return 'text'
  const value = cell.value

  if (value instanceof Date) return 'date'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'object' && 'result' in value) {
    // formula cell — infer from its computed result instead
    if (value.result instanceof Date) return 'date'
    if (typeof value.result === 'number') return 'number'
  }
  return 'text'
}

/** The text a person would see in the cell, for headers written as rich text, numbers or formulas. */
function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value
  if (value == null) return ''
  if (typeof value === 'object' && !(value instanceof Date)) {
    if ('richText' in value) return value.richText.map((part) => part.text).join('').trim()
    if ('result' in value) return value.result == null ? '' : String(value.result).trim()
    if ('text' in value) return String(value.text).trim()
    return ''
  }
  return String(value).trim()
}

function filledCellCount(row: ExcelJS.Row): number {
  let count = 0
  row.eachCell({ includeEmpty: false }, (cell) => {
    if (cellText(cell)) count++
  })
  return count
}

/**
 * Finds the header row without assuming it is row 1: workbooks often start
 * with a title, a logo line or blank rows. The header is taken to be the
 * first row that is about as full as the fullest row near the top — a title
 * fills one or two cells, a header fills most of the table's width.
 * Returns a one-based row number.
 */
export function detectHeaderRow(worksheet: ExcelJS.Worksheet): number {
  const lastRow = Math.min(worksheet.rowCount, MAX_HEADER_SCAN_ROWS)
  const counts: number[] = []
  for (let r = 1; r <= lastRow; r++) counts.push(filledCellCount(worksheet.getRow(r)))

  const fullest = Math.max(0, ...counts)
  if (fullest === 0) return 1

  const threshold = Math.max(2, Math.ceil(fullest * 0.6))
  const index = counts.findIndex((count) => count >= threshold)
  return (index === -1 ? counts.indexOf(fullest) : index) + 1
}

/** Highest row the user may name as the header row. */
export const MAX_HEADER_ROW = 200

function columnsFromRow(worksheet: ExcelJS.Worksheet, headerRowNumber: number): ParsedColumn[] {
  const headerRow = worksheet.getRow(headerRowNumber)
  const sampleRow = worksheet.getRow(headerRowNumber + 1)
  const columns: ParsedColumn[] = []

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const name = cellText(cell)
    if (!name) return
    columns.push({
      name,
      index: colNumber - 1,
      inferredType: inferType(sampleRow.getCell(colNumber)),
    })
  })

  return columns
}

/**
 * Reads one worksheet's columns from the row the user says holds the
 * headings (a one-based row number). Returns null if the sheet is not found.
 */
export async function readSheetColumns(
  buffer: Buffer,
  sheetName: string,
  headerRowNumber: number
): Promise<ParsedColumn[] | null> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  const worksheet = workbook.getWorksheet(sheetName)
  return worksheet ? columnsFromRow(worksheet, headerRowNumber) : null
}

export async function parseWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook()
  // ExcelJS's Buffer typing lags behind Node's
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)

  const sheets: ParsedWorkbook['sheets'] = []
  let sheetIndex = 0

  workbook.eachSheet((worksheet) => {
    const headerRowNumber = detectHeaderRow(worksheet)
    const columns = columnsFromRow(worksheet, headerRowNumber)

    sheets.push({
      name: worksheet.name,
      index: sheetIndex,
      headerRowIndex: headerRowNumber - 1,
      columns,
    })
    sheetIndex++
  })

  return { sheets }
}
