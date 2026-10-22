import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * One page of a document for the Documents step's page viewer: the text read
 * from it and the values extracted from it, named with the job's field labels.
 * Loaded a page at a time, so a 200-page document does not send all its text.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string; pageNumber: string }> }
) {
  const { documentId, pageNumber } = await params
  const page = Number(pageNumber)
  if (!Number.isInteger(page) || page < 1) {
    return NextResponse.json({ error: 'Invalid page' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  // Row level security: another user's document is simply not found
  const { data: doc } = await supabase
    .from('uploaded_documents')
    .select('id, job_id')
    .eq('id', documentId)
    .maybeSingle()
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const [{ data: row }, { data: schema }] = await Promise.all([
    supabase
      .from('document_pages')
      .select('text:ocr_raw->>text, extraction_records(id, extracted_fields(field_key, value))')
      .eq('document_id', documentId)
      .eq('page_number', page)
      .maybeSingle(),
    supabase
      .from('extraction_schemas')
      .select('extraction_fields(field_key, label, sort_order)')
      .eq('job_id', doc.job_id)
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (!row) {
    return NextResponse.json({ error: 'This page has not been read yet.' }, { status: 404 })
  }

  const fields = [...(schema?.extraction_fields ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  const records = (row.extraction_records ?? []).map((record) => {
    const byKey = new Map(record.extracted_fields.map((f) => [f.field_key, f.value]))
    return fields.map((f) => ({ label: f.label, value: byKey.get(f.field_key) ?? null }))
  })

  return NextResponse.json({ text: row.text, records })
}
