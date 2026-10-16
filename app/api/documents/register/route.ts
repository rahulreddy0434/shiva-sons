import { NextResponse } from 'next/server'
import { serverError } from '@/lib/api-error'
import { PDFDocument } from 'pdf-lib'
import { createClient } from '@/lib/supabase/server'
import { refreshJobStatus } from '@/lib/review/load-job'
import { checkDocument } from '@/lib/documents/validate-upload'
import { findIdenticalDocument } from '@/lib/documents/identical-file'

// Reads back or removes files in storage, which can take longer than the default
export const maxDuration = 60

/**
 * Step 2 of an upload. Body: { jobId, path, fileName }.
 *
 * The browser has put the file in storage itself (see upload-url). Nothing
 * about it is taken on trust: the stored bytes are read back here, checked
 * for type, size and readability, and only then recorded. A file that fails
 * is deleted so nothing is left behind.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const jobId = body?.jobId
  const path = body?.path
  const fileName = body?.fileName
  if (typeof jobId !== 'string' || typeof path !== 'string' || typeof fileName !== 'string') {
    return NextResponse.json({ error: 'Missing jobId, path or fileName' }, { status: 400 })
  }

  // Only a file in this user's folder for this job can be registered
  const folder = `${user.id}/${jobId}/`
  if (!path.startsWith(folder) || path.slice(folder.length).includes('/') || path.includes('..')) {
    return NextResponse.json({ error: 'Invalid upload path' }, { status: 400 })
  }

  // Row level security limits this to the user's own jobs
  const { data: job } = await supabase.from('extraction_jobs').select('id').eq('id', jobId).maybeSingle()
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const { data: blob, error: downloadError } = await supabase.storage.from('source-documents').download(path)
  if (downloadError || !blob) {
    return NextResponse.json({ error: `${fileName} did not finish uploading. Please try again.` }, { status: 400 })
  }
  const buffer = Buffer.from(await blob.arrayBuffer())
  const discard = () => supabase.storage.from('source-documents').remove([path])

  // Decided from the file's content, not its name or reported type
  const check = checkDocument(fileName, buffer)
  if ('error' in check) {
    await discard()
    return NextResponse.json({ error: check.error }, { status: 400 })
  }
  const fileType = check.type

  let pageCount = 1
  if (fileType === 'pdf') {
    try {
      const pdf = await PDFDocument.load(buffer)
      pageCount = pdf.getPageCount()
    } catch {
      await discard()
      return NextResponse.json(
        { error: `${fileName} could not be opened. It may be damaged or password-protected.` },
        { status: 400 }
      )
    }
  }

  // The same file twice in a job would put the same cards into Excel twice
  const { data: sameSized } = await supabase
    .from('uploaded_documents')
    .select('original_filename, storage_path')
    .eq('job_id', jobId)
    .eq('file_size', buffer.length)
  const identical = await findIdenticalDocument(
    buffer,
    (sameSized ?? []).map((d) => ({ name: d.original_filename, path: d.storage_path })),
    async (storedPath) => {
      const { data } = await supabase.storage.from('source-documents').download(storedPath)
      return data ? Buffer.from(await data.arrayBuffer()) : null
    }
  )
  if (identical) {
    await discard()
    return NextResponse.json(
      {
        error:
          identical.name === fileName
            ? `${fileName} is already in this job, so it was not added again.`
            : `${fileName} is the same file as ${identical.name}, which is already in this job, so it was not added again.`,
      },
      { status: 409 }
    )
  }

  const { data: document, error: insertError } = await supabase
    .from('uploaded_documents')
    .insert({
      job_id: jobId,
      user_id: user.id,
      storage_path: path,
      original_filename: fileName,
      file_type: fileType,
      file_size: buffer.length,
      page_count: pageCount,
      status: 'uploaded',
    })
    .select()
    .single()
  if (insertError || !document) {
    // Don't leave a file behind that nothing points to
    await discard()
    return serverError('Could not save document record', insertError)
  }

  await refreshJobStatus(supabase, jobId)

  return NextResponse.json({ document })
}
