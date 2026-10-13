import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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

    for (const page of result.pages) {
      await supabase.from('document_pages').insert({
        document_id: documentId,
        user_id: user.id,
        page_number: page.pageNumber,
        ocr_raw: page,
      })
    }

    await supabase.from('uploaded_documents').update({ status: 'ocr_complete' }).eq('id', documentId)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    await supabase.from('uploaded_documents').update({ status: 'failed' }).eq('id', documentId)
    return NextResponse.json({ error: err?.message ?? 'OCR failed' }, { status: 500 })
  }
}