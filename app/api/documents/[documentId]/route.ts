import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { refreshJobStatus } from '@/lib/review/load-job'

/**
 * Removes one uploaded document: its stored file, its OCR pages, and every
 * record extracted from it (those rows cascade from the document).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { data: document } = await supabase
    .from('uploaded_documents')
    .select('id, job_id, storage_path')
    .eq('id', documentId)
    .maybeSingle()
  if (!document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // File first: if this fails the row is still there and the delete can be retried
  const { data: removed, error: storageError } = await supabase.storage
    .from('source-documents')
    .remove([document.storage_path])
  if (storageError) {
    return NextResponse.json({ error: `Could not delete the file — ${storageError.message}` }, { status: 500 })
  }
  // An empty result with no error means the file was already gone, which is fine here
  void removed

  const { data: deleted, error } = await supabase
    .from('uploaded_documents')
    .delete()
    .eq('id', documentId)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Could not delete the document' }, { status: 500 })
  }

  // Its records are gone, so an earlier approval no longer matches the data
  await supabase
    .from('job_approvals')
    .update({ superseded_at: new Date().toISOString() })
    .eq('job_id', document.job_id)
    .is('superseded_at', null)
  await refreshJobStatus(supabase, document.job_id)

  return NextResponse.json({ ok: true })
}
