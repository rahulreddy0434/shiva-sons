import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { fillTemplate, type ExportColumn } from './fill-template'

// Synthetic template: ID, NAME, days 1–3, TOTAL (a formula on the first rows), plus a second sheet
async function buildTemplate(existingRows: (string | number)[][] = []): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Data')
  ws.addRow(['ID', 'NAME', 1, 2, 3, 'TOTAL'])
  ws.getRow(1).font = { bold: true }
  for (const row of existingRows) ws.addRow(row)
  for (let r = 2; r <= 6; r++) ws.getCell(r, 6).value = { formula: `SUM(C${r}:E${r})`, result: 0 }
  ws.getCell('H1').value = 'Notes'
  ws.getCell('H2').value = 'do not touch'
  const other = wb.addWorksheet('Other')
  other.getCell('A1').value = 'untouched sheet'
  return Buffer.from(await wb.xlsx.writeBuffer())
}

const columns: ExportColumn[] = [
  { fieldKey: 'id', columnIndex: 0, dataType: 'string' },
  { fieldKey: 'name', columnIndex: 1, dataType: 'string' },
  { fieldKey: 'day_1', columnIndex: 2, dataType: 'number' },
  { fieldKey: 'day_2', columnIndex: 3, dataType: 'number' },
  { fieldKey: 'day_3', columnIndex: 4, dataType: 'number' },
  { fieldKey: 'total', columnIndex: 5, dataType: 'number' },
]

const records = [
  { id: '701', name: 'Asha Rao', day_1: '10', day_2: '0', day_3: '7.5', total: '17.5' },
  { id: '702', name: 'Vikram Shetty', day_1: '8', day_2: '8', day_3: null, total: '16' },
]

async function open(buffer: Buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  return wb
}

describe('fillTemplate', () => {
  it('writes records under the header with numbers as numbers', async () => {
    const result = await fillTemplate({ template: await buildTemplate(), sheetName: 'Data', headerRowIndex: 0, columns, records })
    const ws = (await open(result.buffer)).getWorksheet('Data')!

    expect(result).toMatchObject({ firstRow: 2, rowsWritten: 2 })
    expect(ws.getCell('A2').value).toBe('701')
    expect(ws.getCell('B2').value).toBe('Asha Rao')
    expect(ws.getCell('C2').value).toBe(10)
    expect(ws.getCell('D2').value).toBe(0)
    expect(ws.getCell('E2').value).toBe(7.5)
    expect(ws.getCell('A3').value).toBe('702')
    expect(ws.getCell('E3').value).toBeNull()
  })

  it('keeps the template formulas instead of overwriting them with extracted totals', async () => {
    const result = await fillTemplate({ template: await buildTemplate(), sheetName: 'Data', headerRowIndex: 0, columns, records })
    const ws = (await open(result.buffer)).getWorksheet('Data')!

    expect(result.formulaCellsKept).toBe(2)
    expect(ws.getCell('F2').formula).toBe('SUM(C2:E2)')
    expect(ws.getCell('F3').formula).toBe('SUM(C3:E3)')
  })

  it('writes the value where the template has no formula', async () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...records[0], id: String(800 + i) }))
    const result = await fillTemplate({ template: await buildTemplate(), sheetName: 'Data', headerRowIndex: 0, columns, records: many })
    const ws = (await open(result.buffer)).getWorksheet('Data')!

    // Template formulas stop at row 6; the 6th record lands on row 7
    expect(result.formulaCellsKept).toBe(5)
    expect(ws.getCell('F7').value).toBe(17.5)
  })

  it('appends below existing records without changing them', async () => {
    const template = await buildTemplate([['600', 'Existing Person', 9, 9, 9]])
    const result = await fillTemplate({ template, sheetName: 'Data', headerRowIndex: 0, columns, records })
    const ws = (await open(result.buffer)).getWorksheet('Data')!

    expect(result.firstRow).toBe(3)
    expect(ws.getCell('A2').value).toBe('600')
    expect(ws.getCell('B2').value).toBe('Existing Person')
    expect(ws.getCell('A3').value).toBe('701')
    expect(ws.getCell('A4').value).toBe('702')
  })

  it('leaves unmapped cells, header styling and other sheets alone', async () => {
    const result = await fillTemplate({ template: await buildTemplate(), sheetName: 'Data', headerRowIndex: 0, columns, records })
    const wb = await open(result.buffer)
    const ws = wb.getWorksheet('Data')!

    expect(ws.getCell('A1').value).toBe('ID')
    expect(ws.getCell('A1').font?.bold).toBe(true)
    expect(ws.getCell('H2').value).toBe('do not touch')
    expect(wb.getWorksheet('Other')!.getCell('A1').value).toBe('untouched sheet')
  })

  it('respects a header row that is not the first row', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Data')
    ws.addRow(['Company timesheet'])
    ws.addRow([])
    ws.addRow(['ID', 'NAME'])
    const template = Buffer.from(await wb.xlsx.writeBuffer())

    const result = await fillTemplate({
      template,
      sheetName: 'Data',
      headerRowIndex: 2,
      columns: columns.slice(0, 2),
      records: [{ id: '1', name: 'A' }],
    })
    const out = (await open(result.buffer)).getWorksheet('Data')!
    expect(result.firstRow).toBe(4)
    expect(out.getCell('A1').value).toBe('Company timesheet')
    expect(out.getCell('A4').value).toBe('1')
  })

  it('writes real dates for date fields and keeps unparseable values as text', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Data').addRow(['DATE', 'HOURS'])
    const template = Buffer.from(await wb.xlsx.writeBuffer())

    const result = await fillTemplate({
      template,
      sheetName: 'Data',
      headerRowIndex: 0,
      columns: [
        { fieldKey: 'date', columnIndex: 0, dataType: 'date' },
        { fieldKey: 'hours', columnIndex: 1, dataType: 'number' },
      ],
      records: [{ date: '2026-08-15', hours: 'eight' }],
    })
    const out = (await open(result.buffer)).getWorksheet('Data')!
    expect(out.getCell('A2').value).toEqual(new Date('2026-08-15T00:00:00.000Z'))
    expect(out.getCell('B2').value).toBe('eight')
  })

  it('writes nothing but still returns a valid workbook for zero records', async () => {
    const result = await fillTemplate({ template: await buildTemplate(), sheetName: 'Data', headerRowIndex: 0, columns, records: [] })
    expect(result.rowsWritten).toBe(0)
    expect((await open(result.buffer)).getWorksheet('Data')!.getCell('A2').value).toBeNull()
  })

  it('fails clearly on a missing worksheet or no mapped columns', async () => {
    const template = await buildTemplate()
    await expect(fillTemplate({ template, sheetName: 'Nope', headerRowIndex: 0, columns, records })).rejects.toThrow('no worksheet named "Nope"')
    await expect(fillTemplate({ template, sheetName: 'Data', headerRowIndex: 0, columns: [], records })).rejects.toThrow('No fields are mapped')
  })
})
