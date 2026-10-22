import { NextResponse } from 'next/server'
import { serverError, GENERIC_FAILURE } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { loadJobExportData, refreshJobStatus } from '@/lib/review/load-job'
import { approvalBlockers, documentsLeftOut, resolveExportColumns, summarizeRecords } from '@/lib/review/job-summary'

/**
 * Records the user's explicit sign-off on the reviewed data.
 * Body: { sheetId, withoutDocuments? } — the worksheet the export will fill, and
 * true when the user agreed to approve although some documents were not extracted.
 *
 * Everything is re-checked here on the server; the summary the browser
 * showed is never trusted.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { data: job } = await supabase.from('extraction_jobs').select('id').eq('id', jobId).maybeSingle()
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  const data = await loadJobExportData(supabase, jobId)

  if (!data.workbook) {
    return NextResponse.json({ error: 'Upload an Excel template before approving.' }, { status: 400 })
  }
  const sheet = data.sheets.find((s) => s.id === body?.sheetId)
  if (!sheet) {
    return NextResponse.json({ error: 'Choose the worksheet to fill.' }, { status: 400 })
  }

  const summary = summarizeRecords(data.fields, data.records, data.policy)
  const { columns } = resolveExportColumns(data.fields, sheet.columns)
  const blockers = approvalBlockers(summary, columns.length)
  if (blockers.length > 0) {
    return NextResponse.json({ error: blockers.join(' ') }, { status: 409 })
  }

  // Cards in a failed or unfinished document would be missing from the export
  const leftOut = documentsLeftOut(data.documents)
  if (leftOut.length > 0 && body?.withoutDocuments !== true) {
    return NextResponse.json(
      {
        error: `${leftOut.length} document${leftOut.length === 1 ? ' is' : 's are'} not included (${leftOut.join(', ')}). Retry ${leftOut.length === 1 ? 'it' : 'them'} in Documents, or confirm that you want to approve without ${leftOut.length === 1 ? 'it' : 'them'}.`,
      },
      { status: 409 }
    )
  }

  const now = new Date().toISOString()

  // Only one approval is current at a time
  const { error: supersedeError } = await supabase
    .from('job_approvals')
    .update({ superseded_at: now })
    .eq('job_id', jobId)
    .is('superseded_at', null)
  if (supersedeError) return serverError(GENERIC_FAILURE, supersedeError)

  const { data: approval, error } = await supabase
    .from('job_approvals')
    .insert({
      job_id: jobId,
      user_id: user.id,
      approved_at: now,
      workbook_file_id: data.workbook.id,
      sheet_id: sheet.id,
      document_count: data.documents.length,
      page_count: data.documents.reduce((total, d) => total + d.pageCount, 0),
      record_count: summary.recordCount,
      corrected_record_count: summary.correctedCount,
      // Uncertain values block approval, so what can remain open here is
      // records nobody individually marked reviewed
      open_warning_count: summary.notReviewedCount,
    })
    .select('id')
    .single()
  if (error || !approval) {
    return serverError('Could not save the approval', error)
  }

  await supabase.from('extraction_jobs').update({ target_sheet_id: sheet.id }).eq('id', jobId)
  await refreshJobStatus(supabase, jobId)

  return NextResponse.json({ approvalId: approval.id })
}
