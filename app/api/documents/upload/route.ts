import { NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_TYPES: Record<string, 'jpg' | 'jpeg' | 'png' | 'pdf'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
}

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

  const fileType = ALLOWED_TYPES[file.type]
  if (!fileType) {
    return NextResponse.json({ error: `${file.name}: unsupported file type` }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  let pageCount = 1
  if (fileType === 'pdf') {
    try {
      const pdf = await PDFDocument.load(buffer)
      pageCount = pdf.getPageCount()
    } catch {
      return NextResponse.json({ error: `${file.name}: could not read that PDF` }, { status: 400 })
    }
  }

  const storagePath = `${user.id}/${jobId}/${Date.now()}-${file.name}`
  const { error: uploadError } = await supabase.storage
    .from('source-documents')
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })
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
      page_count: pageCount,
      status: 'uploaded',
    })
    .select()
    .single()
  if (insertError || !document) {
    return NextResponse.json({ error: insertError?.message ?? 'Could not save document record' }, { status: 500 })
  }

  return NextResponse.json({ document })
}