import { NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { createClient } from '@/lib/supabase/server'
import { refreshJobStatus } from '@/lib/review/load-job'
import { checkDocument, DOCUMENT_CONTENT_TYPE } from '@/lib/documents/validate-upload'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const jobId = formData.get('jobId') as string | null

  if (!file || !jobId) {
    return NextResponse.json({ error: 'Missing file or jobId' }, { status: 400 })
  }

  // Row level security already limits this to the user's own jobs
  const { data: job } = await supabase.from('extraction_jobs').select('id').eq('id', jobId).maybeSingle()
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Decided from the file's content, not its name or reported type
  const check = checkDocument(file.name, buffer)
  if ('error' in check) {
    return NextResponse.json({ error: check.error }, { status: 400 })
  }
  const fileType = check.type

  let pageCount = 1
  if (fileType === 'pdf') {
    try {
      const pdf = await PDFDocument.load(buffer)
      pageCount = pdf.getPageCount()
    } catch {
      return NextResponse.json(
        { error: `${file.name} could not be opened. It may be damaged or password-protected.` },
        { status: 400 }
      )
    }
  }

  // Keep the stored name safe for a storage path; the original is kept in the database
  const safeName = file.name.replace(/[^\w.\- ]+/g, '_')
  const storagePath = `${user.id}/${jobId}/${Date.now()}-${safeName}`
  const { error: uploadError } = await supabase.storage
    .from('source-documents')
    .upload(storagePath, buffer, { contentType: DOCUMENT_CONTENT_TYPE[fileType], upsert: false })
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: document, error: insertError } = await supabase
    .from('uploaded_documents')
    .insert({
      job_id: jobId,
      user_id: user.id,
      storage_path: storagePath,
      original_filename: file.name,
      file_type: fileType,
      file_size: buffer.length,
      page_count: pageCount,
      status: 'uploaded',
    })
    .select()
    .single()
  if (insertError || !document) {
    // Don't leave a file behind that nothing points to
    await supabase.storage.from('source-documents').remove([storagePath])
    return NextResponse.json({ error: insertError?.message ?? 'Could not save document record' }, { status: 500 })
  }

  await refreshJobStatus(supabase, jobId)

  return NextResponse.json({ document })
}
