import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import { PDFDocument, StandardFonts } from 'pdf-lib'

/**
 * The whole product path in a real browser, in mock mode: no document is
 * actually read and every extracted value is fake, so this proves the
 * workflow and the screens — not extraction accuracy.
 */

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD
const screens = join('test-results', 'screens')

async function shot(page: Page, name: string) {
  mkdirSync(screens, { recursive: true })
  await page.screenshot({ path: join(screens, `${name}.png`), fullPage: true })
}

async function syntheticTimecardPdf(): Promise<string> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (const title of ['SYNTHETIC TIME CARD — page 1 (days 1–15)', 'SYNTHETIC TIME CARD — page 2 (days 16–31)']) {
    const page = pdf.addPage([595, 842])
    page.drawText(title.replace(/[—–]/g, '-'), { x: 50, y: 780, size: 16, font })
    page.drawText('Made-up test document. Not a real employee.', { x: 50, y: 750, size: 11, font })
  }
  mkdirSync('test-results', { recursive: true })
  const path = join('test-results', 'synthetic-timecard.pdf')
  writeFileSync(path, await pdf.save())
  return path
}

test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD (a dedicated test account) in .env.local')

test('public pages are open and the app is not', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Turn timecards into Excel data')
  await shot(page, '00-home')

  await page.goto('/privacy')
  await expect(page.getByText('Initial draft')).toBeVisible()
  await page.goto('/terms')
  await expect(page.getByText('Initial draft')).toBeVisible()

  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/sign-in/)
})

test('create a job, extract, review side by side, approve, export and delete', async ({ page }) => {
  const jobName = `E2E ${new Date().toISOString().slice(0, 19)}`

  // Sign in
  await page.goto('/sign-in')
  await page.locator('input[type=email]').fill(email!)
  await page.locator('input[type=password]').fill(password!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByRole('status')).toContainText('Mock mode is on')

  // Name and create the job
  await page.getByRole('link', { name: 'New extraction' }).first().click()
  await page.getByLabel('Job name').fill(jobName)
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page).toHaveURL(/\/extraction\/[0-9a-f-]+\/template/)
  await expect(page.getByRole('heading', { name: jobName })).toBeVisible()

  // Later steps are locked until this one is done
  await expect(page.getByText('Finish this step to continue.')).toBeVisible()

  // Step 1 — template
  await page.getByRole('button', { name: 'Use our standard timecard template' }).click()
  await expect(page.getByText('Shiva Sons timecard template.xlsx uploaded')).toBeVisible()
  await expect(page.getByText('10 column headings found on row 1')).toBeVisible()
  await shot(page, '01-template')
  await page.getByRole('link', { name: 'Next →' }).click()

  // Step 2 — fields
  await expect(page).toHaveURL(/\/instructions/)
  await page.getByRole('button', { name: 'Generate fields' }).click()
  await expect(page.getByText('Fields to extract')).toBeVisible()
  await expect(page.getByLabel('Excel column for Employee name')).toHaveValue(/.+/)
  await shot(page, '02-fields')
  await page.getByRole('button', { name: 'Approve schema' }).click()
  await expect(page.getByRole('button', { name: 'Approved ✓' })).toBeVisible()
  await page.getByRole('link', { name: 'Next →' }).click()

  // Step 3 — documents
  await expect(page).toHaveURL(/\/documents/)
  await page.locator('input[type=file]').setInputFiles(await syntheticTimecardPdf())
  await expect(page.getByText('✓ Uploaded')).toBeVisible()
  await expect(page.getByText('0 of 1 document processed · 0 of 2 pages read')).toBeVisible()
  await page.getByRole('button', { name: /Process 1 document/ }).click()
  await page.getByRole('button', { name: /Extract data from 1 document/ }).click()
  await expect(page.getByText('1 of 1 document processed · 2 of 2 pages read')).toBeVisible()
  await shot(page, '03-documents')
  await page.getByRole('link', { name: 'Next →' }).click()

  // Step 4 — the side-by-side review screen
  await expect(page).toHaveURL(/\/review/)
  const viewer = page.getByRole('region', { name: 'Original document' })
  const data = page.getByRole('region', { name: 'Extracted data' })
  await expect(viewer).toBeVisible()
  await expect(data).toBeVisible()
  await expect(viewer.getByText('Page 1 of 2')).toBeVisible()
  await expect(viewer.locator('iframe')).toBeVisible()

  // Side by side on a desktop-width screen: both panels share a row
  const viewerBox = (await viewer.boundingBox())!
  const dataBox = (await data.boundingBox())!
  expect(dataBox.x).toBeGreaterThan(viewerBox.x + viewerBox.width - 1)

  await viewer.getByRole('button', { name: 'Next page' }).click()
  await expect(viewer.getByText('Page 2 of 2')).toBeVisible()

  // Every mock value is uncertain, so the record needs attention
  await expect(data.getByText('⚠ Needs attention')).toBeVisible()
  await shot(page, '04-review')

  // Approval is refused while a record still needs attention
  await page.getByRole('link', { name: 'Next →' }).click()
  await expect(page.getByText('This job cannot be approved yet')).toBeVisible()
  await page.getByRole('link', { name: 'Go to Review →' }).click()
  await expect(page).toHaveURL(/\/review/)

  // A badly formatted value blocks "mark reviewed"
  const hours = page.getByLabel(/^Total hours/)
  await hours.fill('eight')
  await expect(page.getByText('Total hours should be a plain number like 8 or 7.5.')).toBeVisible()
  await expect(page.getByRole('button', { name: /mark reviewed/i })).toBeDisabled()
  await hours.fill('7.5')

  // Correct a value, save, and find it still there after a reload
  const name = page.getByLabel(/^Employee name/)
  await name.fill('Asha Rao (edited)')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('AI read “MOCK Employee name”')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel(/^Employee name/)).toHaveValue('Asha Rao (edited)')
  await expect(page.getByLabel(/^Total hours/)).toHaveValue('7.5')

  await page.getByRole('button', { name: 'Mark reviewed' }).click()
  await expect(page.getByText('✓ Reviewed', { exact: true })).toBeVisible()
  await shot(page, '05-review-corrected')

  // The same screen on a phone: panels stack, nothing is lost
  await page.setViewportSize({ width: 390, height: 844 })
  const stackedViewer = (await viewer.boundingBox())!
  const stackedData = (await data.boundingBox())!
  expect(stackedData.y).toBeGreaterThan(stackedViewer.y + stackedViewer.height - 1)
  await expect(page.getByLabel(/^Employee name/)).toBeVisible()
  await shot(page, '06-review-mobile')
  await page.setViewportSize({ width: 1280, height: 720 })

  // Step 5 — approve, then export
  await page.getByRole('link', { name: 'Next →' }).click()
  await expect(page).toHaveURL(/\/export/)
  await expect(page.getByRole('button', { name: 'Generate Excel file' })).toBeDisabled()
  await page.getByRole('button', { name: 'Approve 1 record' }).click()
  await page.getByRole('button', { name: 'Yes, approve' }).click()
  await expect(page.getByText(/✓ Approved on/)).toBeVisible()

  await page.getByRole('button', { name: 'Generate Excel file' }).click()
  await expect(page.getByText('1 record written starting at row 2.')).toBeVisible()
  await shot(page, '07-export')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download' }).click()
  const download = await downloadPromise
  const savedTo = join('test-results', 'e2e-export.xlsx')
  await download.saveAs(savedTo)

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(savedTo)
  const sheet = workbook.getWorksheet('Timecards')!
  expect(sheet.getCell('A1').value).toBe('Employee name')
  expect(sheet.getCell('A2').value).toBe('Asha Rao (edited)')
  expect(sheet.getCell('G2').value).toBe(7.5)
  expect(sheet.getCell('A3').value).toBeNull()

  // Editing after approval cancels it
  await page.getByRole('link', { name: '← Back' }).click()
  await page.getByLabel(/^Employee ID/).fill('E-0001')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('AI read “MOCK Employee ID”')).toBeVisible()
  await page.getByRole('link', { name: 'Next →' }).click()
  await expect(page.getByText(/✓ Approved on/)).toHaveCount(0)
  await expect(page.getByText('made before the latest changes')).toBeVisible()

  // The dashboard shows the job and its status
  await page.getByRole('link', { name: 'Dashboard' }).click()
  const row = page.getByRole('row', { name: new RegExp(jobName) })
  await expect(row).toContainText('Needs review')
  await shot(page, '08-dashboard')

  // A new job can start from this one's template, instructions and fields
  const copyName = `${jobName} (copy)`
  await page.getByRole('link', { name: 'New extraction' }).first().click()
  await page.getByLabel('Job name').fill(copyName)
  await page.getByLabel('Start from a previous job').selectOption({ label: `${jobName} — Shiva Sons timecard template.xlsx` })
  await page.getByRole('button', { name: 'Create job' }).click()
  // Template is already there, so the job opens at Step 2 with the fields waiting to be confirmed
  await expect(page).toHaveURL(/\/instructions/)
  await expect(page.getByLabel('Excel column for Employee name')).toHaveValue(/.+/)
  await expect(page.getByRole('button', { name: 'Approve schema' })).toBeVisible()
  // Nothing from the first job's documents or results came along
  await expect(page.getByText('Finish this step to continue.')).toBeVisible()
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete job' }).click()
  await expect(page).toHaveURL(/\/dashboard/)

  // Delete the job, with confirmation
  await row.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('alertdialog')).toContainText(jobName)
  await page.getByRole('button', { name: 'Delete job' }).click()
  await expect(page.getByRole('row', { name: new RegExp(jobName) })).toHaveCount(0)
})
