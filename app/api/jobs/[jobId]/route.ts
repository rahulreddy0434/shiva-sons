import { NextResponse } from 'next/server'
import { serverError, GENERIC_FAILURE } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { removeAllUnder } from '@/lib/storage/list-paths'

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
