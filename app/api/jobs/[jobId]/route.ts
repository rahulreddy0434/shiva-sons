import { NextResponse } from 'next/server'
import { serverError, GENERIC_FAILURE } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { removeAllUnder } from '@/lib/storage/list-paths'

/**
 * Chooses the worksheet the job's records go into (Step 1).
 * Body: { targetSheetId }. The sheet must belong to this job's current template.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const targetSheetId = body?.targetSheetId
  if (typeof targetSheetId !== 'string') {
    return NextResponse.json({ error: 'Missing targetSheetId' }, { status: 400 })
  }

  // Row level security keeps both lookups to the user's own rows
  const { data: workbook } = await supabase
    .from('workbook_files')
    .select('id')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { data: sheet } = workbook
    ? await supabase
        .from('workbook_sheets')
        .select('id')
        .eq('id', targetSheetId)
        .eq('workbook_file_id', workbook.id)
        .maybeSingle()
    : { data: null }
  if (!sheet) {
    return NextResponse.json({ error: 'That worksheet is not in this job’s template' }, { status: 404 })
  }

  const { error } = await supabase.from('extraction_jobs').update({ target_sheet_id: sheet.id }).eq('id', jobId)
  if (error) return serverError('Could not save the worksheet', error)
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { data: job } = await supabase
    .from('extraction_jobs')
    .select('id')
    .eq('id', jobId)
    .maybeSingle()
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Storage objects are not removed by the database cascade, so clear them
  // first — if this fails the job row is still there and delete can be retried.
  try {
    await removeAllUnder(supabase, `${user.id}/${jobId}`)
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ error: `Could not delete the job's files — ${reason}` }, { status: 500 })
  }

  // Child tables cascade from this row
  const { data: deleted, error: deleteError } = await supabase
    .from('extraction_jobs')
    .delete()
    .eq('id', jobId)
    .select('id')
  if (deleteError) {
    return serverError(GENERIC_FAILURE, deleteError)
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Could not delete the job' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
