import ExcelJS from 'exceljs'
import type { ParsedWorkbook, ParsedColumn, InferredType } from '@/types/workbook'

function inferType(cell: ExcelJS.Cell | undefined): InferredType {
  if (!cell || cell.value == null) return 'text'
  const value: any = cell.value

  if (value instanceof Date) return 'date'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'object' && 'result' in value) {
    // formula cell — infer from its computed result instead
    if (value.result instanceof Date) return 'date'
    if (typeof value.result === 'number') return 'number'
  }
  return 'text'
}

export async function parseWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const sheets: ParsedWorkbook['sheets'] = []
  let sheetIndex = 0

  workbook.eachSheet((worksheet) => {
    const headerRow = worksheet.getRow(1)
    const sampleRow = worksheet.getRow(2)
    const columns: ParsedColumn[] = []

    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const name = String(cell.value ?? '').trim()
      if (!name) return
      columns.push({
        name,
        index: colNumber - 1,
        inferredType: inferType(sampleRow.getCell(colNumber)),
      })
    })

    sheets.push({
      name: worksheet.name,
      index: sheetIndex,
      headerRowIndex: 0,
      columns,
    })
    sheetIndex++
  })

  return { sheets }
}