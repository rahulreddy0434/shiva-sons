import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkSelection } from '@/lib/documents/validate-upload'

/**
 * Step 1 of an upload. Body: { jobId, fileName, size }.
 *
 * Returns a one-time link the browser uploads the file to directly, so the
 * file never passes through this server (and its request-size limit). The
 * link only writes to a new path in the user's own folder for this job.
 * Step 2 is /api/documents/register, which checks what was actually stored.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const jobId = body?.jobId
  const fileName = body?.fileName
  const size = Number(body?.size)
  if (typeof jobId !== 'string' || typeof fileName !== 'string' || !Number.isFinite(size)) {
    return NextResponse.json({ error: 'Missing jobId, fileName or size' }, { status: 400 })
  }

  // The browser checked these already; checked again because it can be bypassed
  const { rejected } = checkSelection([{ name: fileName, size }])
  if (rejected.length > 0) {
    return NextResponse.json({ error: `${fileName}: ${rejected[0].error}` }, { status: 400 })
  }

  // Row level security limits this to the user's own jobs
  const { data: job } = await supabase.from('extraction_jobs').select('id').eq('id', jobId).maybeSingle()
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Keep the stored name safe for a storage path; the original is kept in the database
  const safeName = fileName.replace(/[^\w.\- ]+/g, '_').slice(-120)
  const path = `${user.id}/${jobId}/${Date.now()}-${safeName}`
  const { data, error } = await supabase.storage.from('source-documents').createSignedUploadUrl(path)
  if (error || !data) {
    console.error('Could not create an upload link:', error?.message)
    return NextResponse.json({ error: 'The upload could not be started. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ path: data.path, signedUrl: data.signedUrl })
}
