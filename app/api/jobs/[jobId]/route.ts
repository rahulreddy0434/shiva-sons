import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const JOB_BUCKETS = ['original-workbooks', 'source-documents', 'generated-exports']

/** Every object path under `prefix`, walking into sub-folders. */
async function listAllPaths(supabase: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = []
  const pageSize = 1000

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: pageSize, offset })
    if (error) throw new Error(`${bucket}: ${error.message}`)

    for (const entry of data ?? []) {
      const path = `${prefix}/${entry.name}`
      // Folders come back without an id
      if (entry.id === null) paths.push(...(await listAllPaths(supabase, bucket, path)))
      else paths.push(path)
    }

    if (!data || data.length < pageSize) break
  }

  return paths
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
    for (const bucket of JOB_BUCKETS) {
      const paths = await listAllPaths(supabase, bucket, `${user.id}/${jobId}`)
      if (paths.length === 0) continue

      const { data: removed, error } = await supabase.storage.from(bucket).remove(paths)
      if (error) throw new Error(`${bucket}: ${error.message}`)
      // A missing storage delete policy fails silently: no error, nothing removed
      if ((removed?.length ?? 0) < paths.length) {
        throw new Error(`${bucket}: could not remove ${paths.length - (removed?.length ?? 0)} file(s)`)
      }
    }
  } catch (err: any) {
    return NextResponse.json({ error: `Could not delete the job's files — ${err?.message}` }, { status: 500 })
  }

  // Child tables cascade from this row
  const { data: deleted, error: deleteError } = await supabase
    .from('extraction_jobs')
    .delete()
    .eq('id', jobId)
    .select('id')
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Could not delete the job' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
