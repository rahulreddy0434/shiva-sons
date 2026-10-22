import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts } from 'pdf-lib'

/**
 * Approving while a document was not extracted takes an explicit "approve
 * without it", in the browser and on the server. Mock mode, like workflow.spec.
 */

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

async function card(name: string): Promise<string> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  pdf.addPage([595, 842]).drawText(`Made-up test card ${name}`, { x: 50, y: 780, size: 14, font })
  mkdirSync('test-results', { recursive: true })
  const path = join('test-results', `${name}.pdf`)
  writeFileSync(path, await pdf.save())
  return path
}

test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD (a dedicated test account) in .env.local')

test('approving without a document that was not extracted needs a confirmation', async ({ page }) => {
  await page.goto('/sign-in')
  await page.locator('input[type=email]').fill(email!)
  await page.locator('input[type=password]').fill(password!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)

  await page.goto('/extraction/new')
  await page.getByLabel('Job name').fill(`E2E approval ${Date.now()}`)
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page).toHaveURL(/\/template/)
  const jobId = page.url().split('/extraction/')[1].split('/')[0]

  try {
    await page.getByRole('button', { name: 'Use our standard timecard template' }).click()
    await expect(page.getByText('uploaded — drag a different file')).toBeVisible()
    await page.goto(`/extraction/${jobId}/instructions`)
    await page.getByRole('button', { name: 'Use my template’s columns' }).click()
    await page.getByRole('button', { name: 'Make the rest Optional' }).click()
    await page.getByRole('button', { name: 'Approve fields' }).click()
    await expect(page.getByRole('button', { name: 'Fields approved ✓' })).toBeVisible()

    await page.goto(`/extraction/${jobId}/documents`)
    await page.locator('input[type=file]').setInputFiles([await card('card-a'), await card('card-b')])
    await expect(page.getByText('✓ Uploaded')).toHaveCount(2)

    // Only card A is read and extracted; card B is left as uploaded
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    })
    await db.auth.signInWithPassword({ email: email!, password: password! })
    const { data: docs } = await db.from('uploaded_documents').select('id, original_filename').eq('job_id', jobId)
    const cardA = docs!.find((d) => d.original_filename === 'card-a.pdf')!.id
    expect((await page.request.post('/api/extraction/process', { data: { documentId: cardA } })).ok()).toBe(true)
    expect((await page.request.post('/api/extraction/extract', { data: { jobId, documentId: cardA } })).ok()).toBe(true)

    // The mock marks every value uncertain; confirm the record so only card B stands in the way
    const { data: records } = await db.from('extraction_records').select('id').eq('job_id', jobId)
    for (const r of records!) await page.request.patch(`/api/records/${r.id}`, { data: { reviewed: true } })

    await page.goto(`/extraction/${jobId}/export`)
    await expect(page.getByText(/1 document is not included.*card-b\.pdf/)).toBeVisible()
    await page.getByRole('button', { name: /^Approve \d+ record/ }).click()
    const yes = page.getByRole('button', { name: 'Yes, approve' })
    await expect(yes).toBeDisabled()

    // The server refuses too, without the confirmation
    const sheetId = await page.locator('#target-sheet').inputValue()
    const refused = await page.request.post(`/api/jobs/${jobId}/approve`, { data: { sheetId } })
    expect(refused.status()).toBe(409)
    expect((await refused.json()).error).toContain('card-b.pdf')

    await page.getByRole('checkbox', { name: /Approve without this document/ }).check()
    await yes.click()
    await expect(page.getByText(/✓ Approved on/)).toBeVisible()
  } finally {
    await page.request.delete(`/api/jobs/${jobId}`)
  }
})
