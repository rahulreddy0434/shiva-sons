import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { parseWorkbook, readSheetColumns, readSheetPreview } from './parse-workbook'
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

  it('skips a title merged across the columns above the header', async () => {
    const parsed = await parseWorkbook(
      await toBuffer((wb) => {
        const ws = wb.addWorksheet('Data')
        ws.addRow(['Payroll export', '', ''])
        ws.mergeCells('A1:C1')
        ws.addRow([])
        ws.addRow(['Name', 'Week Ending', 'Hours'])
        ws.addRow(['Asha', '2026-10-09', 40])
      })
    )
    expect(parsed.sheets[0].headerRowIndex).toBe(2)
    expect(parsed.sheets[0].columns.map((c) => c.name)).toEqual(['Name', 'Week Ending', 'Hours'])
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

describe('readSheetColumns', () => {
  it('reads the headings from the row the user names, overriding detection', async () => {
    const buffer = await toBuffer((wb) => {
      const ws = wb.addWorksheet('Data')
      ws.addRow(['Region', 'North', 'South', 'East', 'West'])
      ws.addRow(['ID', 'NAME', 'HOURS'])
      ws.addRow(['1', 'Asha', 8])
    })
    // Detection picks the fuller first row; the user knows it is row 2
    expect((await parseWorkbook(buffer)).sheets[0].headerRowIndex).toBe(0)
    expect(await readSheetColumns(buffer, 'Data', 2)).toEqual([
      { name: 'ID', index: 0, inferredType: 'text' },
      { name: 'NAME', index: 1, inferredType: 'text' },
      { name: 'HOURS', index: 2, inferredType: 'number' },
    ])
  })

  it('returns no columns for an empty row and null for an unknown sheet', async () => {
    const buffer = await toBuffer((wb) => {
      wb.addWorksheet('Data').addRow(['ID', 'NAME'])
    })
    expect(await readSheetColumns(buffer, 'Data', 9)).toEqual([])
    expect(await readSheetColumns(buffer, 'Missing', 1)).toBeNull()
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

describe('readSheetPreview', () => {
  it('shows the first rows of data under the headings and counts them, ignoring formula-only rows', async () => {
    const buffer = await toBuffer((wb) => {
      const ws = wb.addWorksheet('Hours')
      ws.addRow(['Contractor hours'])
      ws.addRow(['ID', 'NAME', 'TOTAL'])
      ws.addRow(['1', 'Asha', 8])
      ws.addRow(['2', 'Ravi', 7.5])
      ws.addRow(['3', 'Meena', 9])
      ws.addRow(['4', 'Kiran', 6])
      ws.addRow([null, null, { formula: 'SUM(C3:C6)' }])
    })
    expect(await readSheetPreview(buffer, 'Hours', 2, [0, 1, 2], 2)).toEqual({
      rows: [
        ['1', 'Asha', '8'],
        ['2', 'Ravi', '7.5'],
      ],
      filledRows: 4,
    })
  })

  it('reports an empty template and a missing worksheet', async () => {
    const buffer = await toBuffer((wb) => wb.addWorksheet('Blank').addRow(['ID', 'NAME']))
    expect(await readSheetPreview(buffer, 'Blank', 1, [0, 1])).toEqual({ rows: [], filledRows: 0 })
    expect(await readSheetPreview(buffer, 'Missing', 1, [0, 1])).toBeNull()
  })
})
