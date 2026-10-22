import { createClient } from '@/lib/supabase/server'
import { requireStep } from '@/lib/extraction/job-progress'
import { loadJobExportData } from '@/lib/review/load-job'
import { approvalBlockers, documentsLeftOut, resolveExportColumns, summarizeRecords } from '@/lib/review/job-summary'
import { ApprovalPanel, type ExportEntry, type SheetOption } from '@/components/export/approval-panel'

// How long download links stay valid after the page loads
const SIGNED_URL_SECONDS = 60 * 10

export default async function ExportStepPage({
  params,
}: {
  params: Promise<{ jobId: string }>
}) {
  const { jobId } = await params
  await requireStep(jobId, 'export')
  const supabase = await createClient()

  const [data, { data: job }, { data: approval }, { data: exportRows }] = await Promise.all([
    loadJobExportData(supabase, jobId),
    supabase.from('extraction_jobs').select('target_sheet_id').eq('id', jobId).maybeSingle(),
    supabase
      .from('job_approvals')
      .select('id, approved_at, sheet_id, record_count')
      .eq('job_id', jobId)
      .is('superseded_at', null)
      .order('approved_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('export_files')
      .select('id, filename, storage_path, created_at, record_count, approval_id')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false }),
  ])

  const summary = summarizeRecords(data.fields, data.records, data.policy)

  const sheets: SheetOption[] = data.sheets.map((sheet) => {
    const { columns, unmapped } = resolveExportColumns(data.fields, sheet.columns)
    return {
      id: sheet.id,
      name: sheet.name,
      mappedCount: columns.length,
      unmapped,
      blockers: approvalBlockers(summary, columns.length),
    }
  })

  // Default to the approved sheet, then the last chosen one, then the best match
  const bestMatch = [...sheets].sort((a, b) => b.mappedCount - a.mappedCount)[0]
  const initialSheetId =
    sheets.find((s) => s.id === approval?.sheet_id)?.id ??
    sheets.find((s) => s.id === job?.target_sheet_id)?.id ??
    bestMatch?.id ??
    ''

  const paths = (exportRows ?? []).map((e) => e.storage_path)
  const { data: signed } = paths.length
    ? await supabase.storage.from('generated-exports').createSignedUrls(paths, SIGNED_URL_SECONDS, { download: true })
    : { data: [] }
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))

  const exports: ExportEntry[] = (exportRows ?? []).map((e) => ({
    id: e.id,
    filename: e.filename,
    createdAt: e.created_at,
    recordCount: e.record_count,
    url: urlByPath.get(e.storage_path) ?? null,
    current: approval !== null && e.approval_id === approval.id,
  }))

  return (
    <div className="max-w-4xl">
      <p className="text-sm text-ink-muted mb-4">Step 5 of 5 — Approve and export</p>
      <ApprovalPanel
        jobId={jobId}
        summary={summary}
        documentCount={data.documents.length}
        pageCount={data.documents.reduce((total, d) => total + d.pageCount, 0)}
        failedDocuments={documentsLeftOut(data.documents)}
        templateName={data.workbook?.filename ?? null}
        fieldCount={data.fields.length}
        sheets={sheets}
        initialSheetId={initialSheetId}
        approval={
          approval
            ? {
                approvedAt: approval.approved_at,
                sheetName: data.sheets.find((s) => s.id === approval.sheet_id)?.name ?? null,
                recordCount: approval.record_count,
              }
            : null
        }
        exports={exports}
      />
    </div>
  )
}
