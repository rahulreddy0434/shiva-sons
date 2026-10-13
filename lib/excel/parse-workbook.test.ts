import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { parseWorkbook } from './parse-workbook'
import { buildStarterTemplate, STARTER_COLUMNS } from './starter-template'

async function toBuffer(build: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  build(wb)
  return Buffer.from(await wb.xlsx.writeBuffer())
}

describe('parseWorkbook', () => {
  it('reads headers from row 1 of a plain sheet', async () => {
    const parsed = await parseWorkbook(
      await toBuffer((wb) => {
        const ws = wb.addWorksheet('Data')
        ws.addRow(['ID', 'NAME', 'HOURS'])
        ws.addRow(['1', 'Asha', 8])
      })
    )
    expect(parsed.sheets).toHaveLength(1)
    expect(parsed.sheets[0]).toMatchObject({ name: 'Data', headerRowIndex: 0 })
    expect(parsed.sheets[0].columns).toEqual([
      { name: 'ID', index: 0, inferredType: 'text' },
      { name: 'NAME', index: 1, inferredType: 'text' },
      { name: 'HOURS', index: 2, inferredType: 'number' },
    ])
  })

  it('skips a title and blank rows above the header', async () => {
    const parsed = await parseWorkbook(
      await toBuffer((wb) => {
        const ws = wb.addWorksheet('Data')
        ws.addRow(['Monthly timesheet'])
        ws.addRow(['Prepared by', 'Accounts'])
        ws.addRow([])
        ws.addRow(['ID', 'NAME', 'Company', 'TRADE', 'HOURS'])
        ws.addRow(['1', 'Asha', 'ACME', 'Mason', 8])
      })
    )
    expect(parsed.sheets[0].headerRowIndex).toBe(3)
    expect(parsed.sheets[0].columns.map((c) => c.name)).toEqual(['ID', 'NAME', 'Company', 'TRADE', 'HOURS'])
  })

  it('reads numeric day headers as text names and keeps their positions', async () => {
    const parsed = await parseWorkbook(
      await toBuffer((wb) => {
        wb.addWorksheet('Data').addRow(['ID', 'NAME', 1, 2, 3, 'T/HRS'])
      })
    )
    expect(parsed.sheets[0].columns.map((c) => [c.name, c.index])).toEqual([
      ['ID', 0], ['NAME', 1], ['1', 2], ['2', 3], ['3', 4], ['T/HRS', 5],
    ])
  })

  it('reads rich-text headers and ignores empty header cells', async () => {
    const parsed = await parseWorkbook(
      await toBuffer((wb) => {
        const ws = wb.addWorksheet('Data')
        ws.getCell('A1').value = { richText: [{ text: 'Employee ' }, { text: 'Name', font: { bold: true } }] }
        ws.getCell('C1').value = 'Hours'
      })
    )
    expect(parsed.sheets[0].columns).toEqual([
      { name: 'Employee Name', index: 0, inferredType: 'text' },
      { name: 'Hours', index: 2, inferredType: 'text' },
    ])
  })

  it('reports every worksheet, including an empty one', async () => {
    const parsed = await parseWorkbook(
      await toBuffer((wb) => {
        wb.addWorksheet('First').addRow(['A', 'B'])
        wb.addWorksheet('Empty')
        wb.addWorksheet('Third').addRow(['C', 'D', 'E'])
      })
    )
    expect(parsed.sheets.map((s) => [s.name, s.index, s.columns.length])).toEqual([
      ['First', 0, 2], ['Empty', 1, 0], ['Third', 2, 3],
    ])
  })

  it('rejects something that is not a workbook', async () => {
    await expect(parseWorkbook(Buffer.from('not a spreadsheet'))).rejects.toThrow()
  })
})

describe('buildStarterTemplate', () => {
  it('produces a workbook the parser reads back with the standard timecard columns', async () => {
    const parsed = await parseWorkbook(await buildStarterTemplate())
    expect(parsed.sheets).toHaveLength(1)
    expect(parsed.sheets[0].headerRowIndex).toBe(0)
    expect(parsed.sheets[0].columns.map((c) => c.name)).toEqual(STARTER_COLUMNS.map((c) => c.header))
  })
})
