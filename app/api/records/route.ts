import { NextResponse } from 'next/server'
import { serverError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { refreshJobStatus } from '@/lib/review/load-job'

/**
 * Adds an empty record to a page, for something the AI missed.
 * Body: { documentPageId }
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const documentPageId = body?.documentPageId
  if (typeof documentPageId !== 'string') {
    return NextResponse.json({ error: 'Missing documentPageId' }, { status: 400 })
  }

  // Row level security limits this to the user's own pages
  const { data: page } = await supabase
    .from('document_pages')
    .select('id, document_id')
    .eq('id', documentPageId)
    .maybeSingle()
  if (!page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  }

  const { data: document } = await supabase
    .from('uploaded_documents')
    .select('job_id')
    .eq('id', page.document_id)
    .maybeSingle()
  if (!document) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  }
  const jobId: string = document.job_id

  const { data: record, error } = await supabase
    .from('extraction_records')
    .insert({
      job_id: jobId,
      document_page_id: documentPageId,
      user_id: user.id,
      status: 'needs_review',
      source: 'user_added',
    })
    .select('id')
    .single()
  if (error || !record) {
    return serverError('Could not add a record', error)
  }

  await supabase
    .from('job_approvals')
    .update({ superseded_at: new Date().toISOString() })
    .eq('job_id', jobId)
    .is('superseded_at', null)
  await refreshJobStatus(supabase, jobId)

  return NextResponse.json({ recordId: record.id })
}
