import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { PDFDocument, StandardFonts } from 'pdf-lib'

/**
 * A quick check of a deployed site — a Vercel preview before merging, or the
 * live site after — with real OCR and AI (npm run test:smoke, see
 * docs/DEPLOYMENT.md). Uses the test account and removes what it makes.
 */

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

async function typedCard(): Promise<string> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([595, 842])
  const lines = [
    'TIME CARD (made-up test document)',
    'Employee name: Smoke Test',
    'Employee ID: E-1001',
    'Date: 2026-10-20',
    'Start time: 08:00    End time: 16:30    Break: 30 min',
    'Total hours: 8',
  ]
  lines.forEach((text, i) => page.drawText(text, { x: 50, y: 780 - i * 30, size: i === 0 ? 16 : 13, font }))
  mkdirSync('test-results', { recursive: true })
  const path = join('test-results', 'smoke-card.pdf')
  writeFileSync(path, await pdf.save())
  return path
}

test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD (a dedicated test account) in .env.local')

test('public pages, security headers and health', async ({ page, request }) => {
  for (const path of ['/', '/privacy', '/terms', '/sign-in', '/sign-up']) {
    const res = await page.goto(path)
    expect(res!.status(), path).toBe(200)
  }
  const res = await request.get('/sign-in')
  expect(res.headers()['x-frame-options']).toBe('DENY')
  expect(res.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
  const health = await request.get('/api/health')
  expect(await health.json()).toMatchObject({ status: 'ok', database: 'ok' })
})

test('a job from template to review, with real reading and extraction', async ({ page }) => {
  test.setTimeout(480_000)
  await page.goto('/sign-in')
  await page.locator('input[type=email]').fill(email!)
  await page.locator('input[type=password]').fill(password!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible()

  await page.getByRole('link', { name: 'New extraction' }).first().click()
  await page.getByLabel('Job name').fill(`Smoke test ${new Date().toISOString()}`)
  await page.getByRole('button', { name: 'Create job' }).click()
  await expect(page).toHaveURL(/\/template/)
  const jobId = page.url().split('/extraction/')[1].split('/')[0]

  try {
    await page.getByRole('button', { name: 'Use our standard timecard template' }).click()
    await expect(page.getByText('uploaded — drag a different file')).toBeVisible()
    await page.getByRole('link', { name: 'Next →' }).click()

    await page.getByRole('button', { name: 'Use my template’s columns' }).click()
    await expect(page.getByRole('button', { name: 'Approve fields' })).toBeDisabled()
    await page.getByRole('button', { name: 'Make the suggested fields Required' }).click()
    await page.getByRole('button', { name: 'Make the rest Optional' }).click()
    await page.getByRole('button', { name: 'Approve fields' }).click()
    await expect(page.getByRole('button', { name: 'Fields approved ✓' })).toBeVisible()
    await page.getByRole('link', { name: 'Next →' }).click()

    await page.locator('input[type=file]').setInputFiles(await typedCard())
    await expect(page.getByText('✓ Uploaded')).toBeVisible()
    await page.getByRole('button', { name: /^Process 1 document/ }).click()
    await expect(page.getByText('0 of 1 extracted · 1 of 1 pages read')).toBeVisible({ timeout: 180_000 })

    await page.getByRole('button', { name: /Extract data from 1 document/ }).click()
    const done = page.getByText('1 of 1 extracted · 1 of 1 pages read')
    const aiDown = page.getByText(/The AI service (is busy|has reached its usage limit)/).first()
    await expect(done.or(aiDown)).toBeVisible({ timeout: 300_000 })
    if (await aiDown.isVisible()) {
      // The deployment works; Google's free tier did not answer this time
      test.info().annotations.push({ type: 'note', description: 'Extraction skipped: the AI service was busy or out of quota' })
      return
    }

    await page.getByRole('link', { name: 'Next →' }).click()
    await expect(page).toHaveURL(/\/review/)
    await expect(page.getByRole('region', { name: 'Original document' })).toBeVisible()
    await expect(page.getByLabel(/^Employee ID/)).toHaveValue('E-1001')
  } finally {
    // Leave nothing behind on the shared database
    await page.request.delete(`/api/jobs/${jobId}`)
  }
})
