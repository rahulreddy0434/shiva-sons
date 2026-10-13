import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractStructuredData } from '@/lib/llm/provider'

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
    .select('id, extraction_fields(field_key, label, data_type, required)')
    .eq('job_id', jobId)
    .eq('approved', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!schema) {
    return NextResponse.json({ error: 'No approved schema for this job yet' }, { status: 400 })
  }

  const fields = (schema.extraction_fields ?? []).map((f: any) => ({
    key: f.field_key,
    label: f.label,
    dataType: f.data_type,
    required: f.required,
    sortOrder: 0,
  }))

  try {
    const { data: pages } = await supabase
      .from('document_pages')
      .select('id, page_number, ocr_raw')
      .eq('document_id', documentId)
      .order('page_number', { ascending: true })

    for (const page of pages ?? []) {
      const records = await extractStructuredData({
        instructions: instructionsRow?.instructions_text ?? '',
        fields,
        pageText: (page.ocr_raw as any)?.text ?? '',
      })

      for (const record of records) {
        const { data: recordRow, error: recordError } = await supabase
          .from('extraction_records')
          .insert({ job_id: jobId, document_page_id: page.id, user_id: user.id, status: 'extracted' })
          .select()
          .single()
        if (recordError || !recordRow) throw new Error(recordError?.message ?? 'Could not create record')

        const fieldRows = Object.entries(record).map(([fieldKey, result]) => ({
          record_id: recordRow.id,
          user_id: user.id,
          field_key: fieldKey,
          value: result.value === null ? null : String(result.value),
          confidence: result.confidence,
          status: result.status,
          original_ai_value: result.value === null ? null : String(result.value),
        }))

        if (fieldRows.length > 0) {
          const { error: fieldsError } = await supabase.from('extracted_fields').insert(fieldRows)
          if (fieldsError) throw new Error(fieldsError.message)
        }
      }
    }

    await supabase.from('uploaded_documents').update({ status: 'extraction_complete' }).eq('id', documentId)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    await supabase.from('uploaded_documents').update({ status: 'failed' }).eq('id', documentId)
    return NextResponse.json({ error: err?.message ?? 'Extraction failed' }, { status: 500 })
  }
}