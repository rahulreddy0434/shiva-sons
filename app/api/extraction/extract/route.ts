import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { extractStructuredData } from '@/lib/llm/provider'
import { describeLlmError } from '@/lib/llm/errors'
import { isEmptyRecord, normalizeRecord, type NormalizedFieldResult } from '@/lib/extraction/normalize-records'
import { continuesRecord, mergeRecords } from '@/lib/extraction/page-batches'
import { refreshJobStatus } from '@/lib/review/load-job'
import type { ExtractionField } from '@/types/extraction'

// Reading a document or waiting on a busy AI model can take minutes; 300 s is
// the most Vercel's Hobby plan allows (see docs/DEPLOYMENT.md)
export const maxDuration = 300

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  // fromPage / toPage: one part of a long document (see lib/extraction/page-batches.ts).
  // Without them the whole document is extracted in one call.
  const { jobId, documentId, fromPage, toPage } = await request.json()
  if (!jobId || !documentId) {
    return NextResponse.json({ error: 'Missing jobId or documentId' }, { status: 400 })
  }
  const ranged = fromPage !== undefined || toPage !== undefined
  if (ranged && !(Number.isInteger(fromPage) && Number.isInteger(toPage) && fromPage >= 1 && toPage >= fromPage)) {
    return NextResponse.json({ error: 'Invalid page range' }, { status: 400 })
  }

  const { data: instructionsRow } = await supabase
    .from('extraction_instructions')
    .select('instructions_text')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: schema } = await supabase
    .from('extraction_schemas')
    .select('id, extraction_fields(field_key, label, data_type, required, sort_order)')
    .eq('job_id', jobId)
    .eq('approved', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!schema) {
    return NextResponse.json({ error: 'No approved schema for this job yet' }, { status: 400 })
  }

  const fields: ExtractionField[] = (schema.extraction_fields ?? [])
    .map((f) => ({
      key: f.field_key,
      label: f.label,
      dataType: f.data_type as ExtractionField['dataType'],
      required: f.required,
      sortOrder: f.sort_order,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const { data: allPages } = await supabase
    .from('document_pages')
    .select('id, page_number')
    .eq('document_id', documentId)
    .order('page_number', { ascending: true })

  let pagesQuery = supabase
    .from('document_pages')
    .select('id, page_number, text:ocr_raw->>text, tables:ocr_raw->tables')
    .eq('document_id', documentId)
    .order('page_number', { ascending: true })
  if (ranged) pagesQuery = pagesQuery.gte('page_number', fromPage).lte('page_number', toPage)
  const { data: pages } = await pagesQuery

  if (!allPages || allPages.length === 0 || !pages || pages.length === 0) {
    return NextResponse.json({ error: 'This document has not been read yet — run OCR first.' }, { status: 400 })
  }
  const lastPage = allPages[allPages.length - 1].page_number
  const isLastPart = !ranged || toPage >= lastPage

  const limited = await checkRateLimit(supabase, user.id, 'extract')
  if (limited) {
    return NextResponse.json({ error: limited }, { status: 429 })
  }

  try {
    // Re-running must not duplicate: clear what an earlier (failed or
    // partial) run extracted from these pages. Records a person added are kept.
    const { error: clearError } = await supabase
      .from('extraction_records')
      .delete()
      .in('document_page_id', pages.map((p) => p.id))
      .eq('source', 'extracted')
    if (clearError) throw new Error(clearError.message)

    // The whole document goes in one call: a time card often runs over two
    // pages and must come back as one record, not two halves.
    const records = await extractStructuredData({
      instructions: instructionsRow?.instructions_text ?? '',
      fields,
      pages: pages.map((page) => ({
        pageNumber: page.page_number,
        text: (page.text as string | null) ?? '',
        tables: ((page.tables as { rows: string[][] }[] | null) ?? []).map((t) => t.rows),
      })),
    })

    // A card cut in two where this part meets the previous one is joined to
    // the record already made from its first half
    let previous = ranged && fromPage > 1 ? await lastRecordBefore(supabase, allPages, fromPage) : null

    for (const record of records) {
      const results = normalizeRecord(record?.fields, fields)
      if (isEmptyRecord(results)) continue

      if (previous && continuesRecord(previous.results, results, fields)) {
        await updateMergedFields(supabase, previous.id, previous.results, mergeRecords(previous.results, results))
        previous = null
        continue
      }
      // Only the first record of a part can continue the previous part
      previous = null

      // Attach the record to the page it starts on; fall back to the first page
      const startPage = pages.find((p) => p.page_number === Number(record?.page)) ?? pages[0]

      const { data: recordRow, error: recordError } = await supabase
        .from('extraction_records')
        .insert({ job_id: jobId, document_page_id: startPage.id, user_id: user.id, status: 'extracted' })
        .select()
        .single()
      if (recordError || !recordRow) throw new Error(recordError?.message ?? 'Could not create record')

      const { error: fieldsError } = await supabase.from('extracted_fields').insert(
        results.map((r) => ({
          record_id: recordRow.id,
          user_id: user.id,
          field_key: r.fieldKey,
          value: r.value,
          confidence: r.confidence,
          status: r.status,
          original_ai_value: r.value,
        }))
      )
      if (fieldsError) throw new Error(fieldsError.message)
    }

    // A long document is complete once its last part is done
    await supabase
      .from('uploaded_documents')
      .update({ status: isLastPart ? 'extraction_complete' : 'ocr_complete', error_message: null })
      .eq('id', documentId)
    // Re-extracting replaces records, so an earlier approval no longer covers the data
    await supabase
      .from('job_approvals')
      .update({ superseded_at: new Date().toISOString() })
      .eq('job_id', jobId)
      .is('superseded_at', null)
    await refreshJobStatus(supabase, jobId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = describeLlmError(err)
    // Log the cause for the developer, never the document's contents
    console.error(`Extraction failed for document ${documentId}:`, err instanceof Error ? err.message : err)
    await supabase
      .from('uploaded_documents')
      .update({ status: 'failed', error_message: message })
      .eq('id', documentId)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

type Supabase = Awaited<ReturnType<typeof createClient>>

/** The AI-made record on the latest page before `fromPage`, with its values. */
async function lastRecordBefore(
  supabase: Supabase,
  allPages: { id: string; page_number: number }[],
  fromPage: number
): Promise<{ id: string; results: NormalizedFieldResult[] } | null> {
  const earlier = allPages.filter((p) => p.page_number < fromPage)
  if (earlier.length === 0) return null
  const pageNumberById = new Map(earlier.map((p) => [p.id, p.page_number]))

  const { data: rows } = await supabase
    .from('extraction_records')
    .select('id, document_page_id, created_at, extracted_fields(field_key, value, confidence, status)')
    .in('document_page_id', earlier.map((p) => p.id))
    .eq('source', 'extracted')
  if (!rows || rows.length === 0) return null

  const last = [...rows].sort(
    (a, b) =>
      (pageNumberById.get(b.document_page_id) ?? 0) - (pageNumberById.get(a.document_page_id) ?? 0) ||
      b.created_at.localeCompare(a.created_at)
  )[0]
  return {
    id: last.id,
    results: last.extracted_fields.map((f) => ({
      fieldKey: f.field_key,
      value: f.value,
      confidence: f.confidence,
      status: f.status as NormalizedFieldResult['status'],
    })),
  }
}

/** Writes the fields a merge changed; the value the AI read stays recorded as the original. */
async function updateMergedFields(
  supabase: Supabase,
  recordId: string,
  before: NormalizedFieldResult[],
  after: NormalizedFieldResult[]
): Promise<void> {
  for (const merged of after) {
    const old = before.find((r) => r.fieldKey === merged.fieldKey)
    if (old && old.value === merged.value && old.status === merged.status && old.confidence === merged.confidence) continue
    const { error } = await supabase
      .from('extracted_fields')
      .update({
        value: merged.value,
        confidence: merged.confidence,
        status: merged.status,
        ...(old?.value === null ? { original_ai_value: merged.value } : {}),
      })
      .eq('record_id', recordId)
      .eq('field_key', merged.fieldKey)
    if (error) throw new Error(error.message)
  }
}
