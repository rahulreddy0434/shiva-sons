import ExcelJS from 'exceljs'

/** The suggested timecard fields from the product spec, as a ready-made template. */
export const STARTER_COLUMNS = [
  { header: 'Employee name', width: 24 },
  { header: 'Employee ID', width: 14 },
  { header: 'Date', width: 14 },
  { header: 'Start time', width: 12 },
  { header: 'End time', width: 12 },
  { header: 'Break duration', width: 16 },
  { header: 'Total hours', width: 13 },
  { header: 'Overtime hours', width: 16 },
  { header: 'Job or project', width: 22 },
  { header: 'Company or trade', width: 22 },
] as const

export const STARTER_TEMPLATE_FILENAME = 'Shiva Sons timecard template.xlsx'

/** A plain one-sheet workbook for customers who have no template of their own. */
export async function buildStarterTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Timecards')

  sheet.columns = STARTER_COLUMNS.map((column) => ({ header: column.header, width: column.width }))
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  return Buffer.from(await workbook.xlsx.writeBuffer())
}
