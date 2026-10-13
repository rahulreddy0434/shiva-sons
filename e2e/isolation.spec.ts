import { expect, test, type Browser, type BrowserContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

/**
 * One customer must never reach another customer's data. Account A creates a
 * job with a template, a document and an extracted record; account B then
 * tries every way in: the pages, the app's API routes, and the database and
 * file storage directly with its own valid sign-in.
 */

const owner = { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD }
const intruder = { email: process.env.E2E_EMAIL_2, password: process.env.E2E_PASSWORD_2 }
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

test.skip(
  !owner.email || !owner.password || !intruder.email || !intruder.password || !supabaseUrl || !anonKey,
  'Needs two test accounts (E2E_EMAIL/E2E_PASSWORD and E2E_EMAIL_2/E2E_PASSWORD_2) in .env.local'
)

async function signIn(browser: Browser, who: { email?: string; password?: string }): Promise<BrowserContext> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('/sign-in')
  await page.locator('input[type=email]').fill(who.email!)
  await page.locator('input[type=password]').fill(who.password!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/dashboard/)
  await page.close()
  return context
}

/** A direct database/storage client signed in as the given account, as an attacker with a valid login would have. */
async function directClient(who: { email?: string; password?: string }) {
  const client = createClient(supabaseUrl!, anonKey!, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email: who.email!, password: who.password! })
  if (error) throw error
  return client
}

const TABLES = [
  'extraction_jobs', 'workbook_files', 'workbook_sheets', 'workbook_columns', 'extraction_instructions',
  'extraction_schemas', 'extraction_fields', 'uploaded_documents', 'document_pages', 'extraction_records',
  'extracted_fields', 'job_approvals', 'export_files', 'api_usage',
]

test('a second account cannot see, change or delete the first account’s job', async ({ browser }) => {
  const jobName = `Isolation ${new Date().toISOString().slice(0, 19)}`

  // --- Account A builds a job through the app (mock mode: nothing real is read)
  const ownerContext = await signIn(browser, owner)
  const page = await ownerContext.newPage()
  await page.goto('/extraction/new')
  await page.getByLabel('Job name').fill(jobName)
  await page.getByRole('button', { name: 'Create job' }).click()
  await page.waitForURL(/\/extraction\/[0-9a-f-]+\/template/)
  const jobId = page.url().match(/extraction\/([0-9a-f-]+)\//)![1]

  await page.getByRole('button', { name: 'Use our standard timecard template' }).click()
  await expect(page.getByText('uploaded — drag a different file')).toBeVisible()
  await page.getByRole('link', { name: 'Next →' }).click()
  await page.getByRole('button', { name: 'Use my template’s columns' }).click()
  await page.getByRole('button', { name: 'Approve schema' }).click()
  await expect(page.getByRole('button', { name: 'Approved ✓' })).toBeVisible()
  await page.getByRole('link', { name: 'Next →' }).click()
  await page.locator('input[type=file]').setInputFiles({
    name: 'card.png',
    mimeType: 'image/png',
    // The PNG signature is enough for the upload check; mock mode never decodes the image
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
  })
  await expect(page.getByText('✓ Uploaded')).toBeVisible()
  await page.getByRole('button', { name: /Process 1 document/ }).click()
  await page.getByRole('button', { name: /Extract data from 1 document/ }).click()
  await expect(page.getByText('1 of 1 document processed')).toBeVisible()

  // What A owns, read with A's own direct client
  const ownerDb = await directClient(owner)
  const { data: ownDocs } = await ownerDb.from('uploaded_documents').select('id, storage_path').eq('job_id', jobId)
  const { data: ownRecords } = await ownerDb.from('extraction_records').select('id').eq('job_id', jobId)
  const { data: ownSchemas } = await ownerDb.from('extraction_schemas').select('id').eq('job_id', jobId)
  const { data: ownWorkbooks } = await ownerDb.from('workbook_files').select('storage_path').eq('job_id', jobId)
  expect(ownDocs).toHaveLength(1)
  expect(ownRecords).toHaveLength(1)
  const documentId = ownDocs![0].id
  const recordId = ownRecords![0].id
  const schemaId = ownSchemas![0].id

  // --- Account B: the pages
  const intruderContext = await signIn(browser, intruder)
  const intruderPage = await intruderContext.newPage()
  for (const step of ['', '/template', '/instructions', '/documents', '/review', '/export']) {
    const response = await intruderPage.goto(`/extraction/${jobId}${step}`)
    expect(response!.status(), `page ${step || '(job root)'}`).toBe(404)
  }
  await intruderPage.goto('/jobs')
  await expect(intruderPage.getByText(jobName)).toHaveCount(0)

  // --- Account B: every API route, with B's valid session
  const api = intruderContext.request
  const attempts: [string, Promise<{ status(): number }>][] = [
    ['delete job', api.delete(`/api/jobs/${jobId}`)],
    ['approve job', api.post(`/api/jobs/${jobId}/approve`, { data: { sheetId: 'x' } })],
    ['export job', api.post(`/api/jobs/${jobId}/export`, { data: {} })],
    ['delete document', api.delete(`/api/documents/${documentId}`)],
    ['edit record', api.patch(`/api/records/${recordId}`, { data: { fields: [{ key: 'employee_name', value: 'hacked' }] } })],
    ['delete record', api.delete(`/api/records/${recordId}`)],
    ['re-run OCR', api.post('/api/extraction/process', { data: { documentId } })],
    ['re-run extraction', api.post('/api/extraction/extract', { data: { jobId, documentId } })],
    ['generate fields', api.post('/api/schema/generate', { data: { jobId, instructions: 'x', useColumns: true } })],
    ['starter template', api.post('/api/workbooks/starter', { data: { jobId } })],
    [
      'upload document',
      api.post('/api/documents/upload', {
        multipart: { jobId, file: { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) } },
      }),
    ],
  ]
  for (const [what, attempt] of attempts) {
    const status = (await attempt).status()
    expect(status, `${what} should be refused`).toBeGreaterThanOrEqual(400)
    expect(status, `${what} should be refused, not crash`).toBeLessThan(500)
  }
  expect((await api.patch(`/api/schema/${schemaId}`, { data: { approved: false, fields: [] } })).status()).toBe(404)
  expect((await api.delete(`/api/schema/${schemaId}`)).status()).toBe(404)
  // B cannot copy A's setup into a job of its own either: the source is invisible, so nothing is copied
  await intruderPage.goto('/extraction/new')
  await expect(intruderPage.getByText(jobName)).toHaveCount(0)

  // --- Account B: straight to the database and storage, bypassing the app
  const intruderDb = await directClient(intruder)
  const { data: ownerUser } = await ownerDb.auth.getUser()
  const ownerId = ownerUser.user!.id

  for (const table of TABLES) {
    const { data, error } = await intruderDb.from(table).select('*').eq('user_id', ownerId)
    expect(error, `${table} select`).toBeNull()
    expect(data, `${table} must show none of A's rows`).toEqual([])
  }
  const { data: stolenUpdate } = await intruderDb.from('extraction_jobs').update({ name: 'hacked' }).eq('id', jobId).select()
  expect(stolenUpdate).toEqual([])
  const { data: stolenDelete } = await intruderDb.from('extraction_records').delete().eq('id', recordId).select()
  expect(stolenDelete).toEqual([])
  // B cannot plant rows in A's job either
  const { error: plantError } = await intruderDb
    .from('uploaded_documents')
    .insert({ job_id: jobId, user_id: ownerId, storage_path: 'x', original_filename: 'x', file_type: 'pdf' })
  expect(plantError).not.toBeNull()

  const stolenFile = await intruderDb.storage.from('source-documents').download(ownDocs![0].storage_path)
  expect(stolenFile.data).toBeNull()
  const stolenWorkbook = await intruderDb.storage.from('original-workbooks').download(ownWorkbooks![0].storage_path)
  expect(stolenWorkbook.data).toBeNull()
  const { data: listed } = await intruderDb.storage.from('source-documents').list(`${ownerId}/${jobId}`)
  expect(listed ?? []).toEqual([])
  const { error: overwriteError } = await intruderDb.storage
    .from('source-documents')
    .upload(`${ownerId}/${jobId}/planted.png`, Buffer.from('x'), { upsert: true })
  expect(overwriteError).not.toBeNull()

  // --- Nothing of A's changed
  const { data: job } = await ownerDb.from('extraction_jobs').select('name').eq('id', jobId).single()
  expect(job!.name).toBe(jobName)
  const { data: schema } = await ownerDb.from('extraction_schemas').select('approved, extraction_fields(id)').eq('id', schemaId).single()
  expect(schema!.approved).toBe(true)
  expect(schema!.extraction_fields.length).toBe(10)
  const { data: field } = await ownerDb.from('extracted_fields').select('value').eq('record_id', recordId).eq('field_key', 'employee_name').single()
  expect(field!.value).toBe('MOCK Employee name')
  const { count: documentsLeft } = await ownerDb.from('uploaded_documents').select('id', { count: 'exact', head: true }).eq('job_id', jobId)
  expect(documentsLeft).toBe(1)
  const ownFile = await ownerDb.storage.from('source-documents').download(ownDocs![0].storage_path)
  expect(ownFile.data).not.toBeNull()

  // --- A cleans up through the app
  const cleanup = await ownerContext.request.delete(`/api/jobs/${jobId}`)
  expect(cleanup.status()).toBe(200)
  await ownerContext.close()
  await intruderContext.close()
})
