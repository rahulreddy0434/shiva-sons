import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analyzeDocument } from '@/lib/azure/document-intelligence'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { jobId } = await request.json()
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
  }

  const { data: documents, error: docsError } = await supabase
    .from('uploaded_documents')
    .select('id, storage_path, original_filename')
    .eq('job_id', jobId)
    .eq('status', 'uploaded')

  if (docsError) {
    return NextResponse.json({ error: docsError.message }, { status: 500 })
  }
  if (!documents || documents.length === 0) {
    return NextResponse.json({ processed: 0, failed: 0 })
  }

  let processed = 0
  let failed = 0

  for (const doc of documents) {
    try {
      await supabase.from('uploaded_documents').update({ status: 'processing' }).eq('id', doc.id)

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
          document_id: doc.id,
          user_id: user.id,
          page_number: page.pageNumber,
          ocr_raw: page,
        })
      }

      await supabase.from('uploaded_documents').update({ status: 'ocr_complete' }).eq('id', doc.id)
      processed++
    } catch {
      await supabase.from('uploaded_documents').update({ status: 'failed' }).eq('id', doc.id)
      failed++
    }
  }

  return NextResponse.json({ processed, failed })
}