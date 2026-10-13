import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { analyzeDocument } from '@/lib/azure/document-intelligence'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { documentId } = await request.json()
  if (!documentId) {
    return NextResponse.json({ error: 'Missing documentId' }, { status: 400 })
  }

  const { data: doc, error: docError } = await supabase
    .from('uploaded_documents')
    .select('id, storage_path')
    .eq('id', documentId)
    .single()
  if (docError || !doc) {
    return NextResponse.json({ error: docError?.message ?? 'Document not found' }, { status: 404 })
  }

  const limited = await checkRateLimit(supabase, user.id, 'ocr')
  if (limited) {
    return NextResponse.json({ error: limited }, { status: 429 })
  }

  try {
    await supabase.from('uploaded_documents').update({ status: 'processing' }).eq('id', documentId)

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('source-documents')
      .download(doc.storage_path)
    if (downloadError || !fileBlob) {
      throw new Error(downloadError?.message ?? 'Could not download file from storage')
    }

    const buffer = Buffer.from(await fileBlob.arrayBuffer())
    const result = await analyzeDocument(buffer)

    // Upsert on (document, page) so retrying OCR replaces pages instead of duplicating them
    const { error: pagesError } = await supabase.from('document_pages').upsert(
      result.pages.map((page) => ({
        document_id: documentId,
        user_id: user.id,
        page_number: page.pageNumber,
        ocr_raw: page,
      })),
      { onConflict: 'document_id,page_number' }
    )
    if (pagesError) throw new Error(pagesError.message)

    await supabase
      .from('uploaded_documents')
      .update({ status: 'ocr_complete', error_message: null })
      .eq('id', documentId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = 'This document could not be read. Check that the file opens normally, then try again.'
    // Log the cause for the developer, never the document's contents
    console.error(`OCR failed for document ${documentId}:`, err instanceof Error ? err.message.slice(0, 300) : err)
    await supabase
      .from('uploaded_documents')
      .update({ status: 'failed', error_message: message })
      .eq('id', documentId)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}