import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { extractStructuredData } from '@/lib/llm/provider'
import { describeLlmError } from '@/lib/llm/errors'
import { isEmptyRecord, normalizeRecord } from '@/lib/extraction/normalize-records'
import { refreshJobStatus } from '@/lib/review/load-job'
import type { ExtractionField } from '@/types/extraction'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { jobId, documentId } = await request.json()
  if (!jobId || !documentId) {
    return NextResponse.json({ error: 'Missing jobId or documentId' }, { status: 400 })
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

  const { data: pages } = await supabase
    .from('document_pages')
    .select('id, page_number, text:ocr_raw->>text, tables:ocr_raw->tables')
    .eq('document_id', documentId)
    .order('page_number', { ascending: true })

  if (!pages || pages.length === 0) {
    return NextResponse.json({ error: 'This document has not been read yet — run OCR first.' }, { status: 400 })
  }

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

    for (const record of records) {
      const results = normalizeRecord(record?.fields, fields)
      if (isEmptyRecord(results)) continue

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

    await supabase
      .from('uploaded_documents')
      .update({ status: 'extraction_complete', error_message: null })
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
