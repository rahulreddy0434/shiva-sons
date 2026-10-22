import { createClient } from '@/lib/supabase/server'
import { requireStep } from '@/lib/extraction/job-progress'
import { DocumentDropzone } from '@/components/upload/document-dropzone'
import { ProcessButton } from '@/components/extraction/process-button'
import { ExtractButton } from '@/components/extraction/extract-button'
import { PageViewer } from '@/components/extraction/page-viewer'
import { RetryDocumentButton } from '@/components/extraction/retry-document-button'
import { groupPageStatuses, pageStatuses, type PageState } from '@/lib/extraction/page-status'
import { RemoveDocumentButton } from '@/components/upload/remove-document-button'
import { formatBytes, MAX_DOCUMENT_BYTES, MAX_UPLOAD_TOTAL_BYTES } from '@/lib/documents/validate-upload'
import { purgedDocumentIds, RETENTION_DAYS } from '@/lib/retention'

const PAGE_GROUP: Record<PageState, string> = {
  records: 'border-success text-success',
  continues: 'border-line text-ink-muted',
  read: 'border-brand-blue text-brand-blue',
  not_read: 'border-line text-ink-muted',
  removed: 'border-line text-ink-faint',
  empty: 'border-brand bg-brand-soft text-brand-strong',
}

/** A page list longer than this is shown as a count, with the page numbers on hover. */
const MAX_RANGE_TEXT = 60

interface PageRow {
  id: string
  document_id: string
  page_number: number
  // Only what the summary needs; a page's text is loaded when the user opens it
  extraction_records: { id: string }[]
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  uploaded: { label: 'Uploaded, not read yet', className: 'border-line text-ink-muted' },
  processing: { label: 'Being read…', className: 'border-brand-blue text-brand-blue' },
  ocr_complete: { label: 'Read, data not extracted yet', className: 'border-brand-blue text-brand-blue' },
  extraction_complete: { label: '✓ Data extracted', className: 'border-success text-success' },
  needs_review: { label: 'Needs review', className: 'border-brand text-brand-strong' },
  completed: { label: '✓ Done', className: 'border-success text-success' },
  failed: { label: '✕ Failed', className: 'border-danger bg-brand-soft text-danger' },
}

export default async function DocumentsStepPage({
  params,
}: {
  params: Promise<{ jobId: string }>
}) {
  const { jobId } = await params
  await requireStep(jobId, 'documents')
  const supabase = await createClient()

  const { data: documents } = await supabase
    .from('uploaded_documents')
    .select('id, original_filename, file_type, file_size, page_count, status, error_message')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })

  const pagesByDocument = new Map<string, PageRow[]>()
  if (documents && documents.length > 0) {
    const { data: pages } = await supabase
      .from('document_pages')
      .select('id, document_id, page_number, extraction_records(id)')
      .in('document_id', documents.map((d) => d.id))
      .order('page_number', { ascending: true })

    for (const p of (pages ?? []) as PageRow[]) {
      const list = pagesByDocument.get(p.document_id) ?? []
      list.push(p)
      pagesByDocument.set(p.document_id, list)
    }
  }

  // Originals removed under the retention policy can no longer be read or re-read
  const purged = await purgedDocumentIds(supabase, jobId)
  const live = documents?.filter((d) => !purged.has(d.id)) ?? []

  // A failed document goes back into whichever step it failed at, so it can be retried
  const hasPages = (id: string) => (pagesByDocument.get(id)?.length ?? 0) > 0
  const pendingOcrIds = live
    .filter((d) => d.status === 'uploaded' || (d.status === 'failed' && !hasPages(d.id)))
    .map((d) => d.id)
  const pendingExtract = live
    .filter((d) => d.status === 'ocr_complete' || (d.status === 'failed' && hasPages(d.id)))
    .map((d) => ({ id: d.id, pageCount: pagesByDocument.get(d.id)?.length ?? 1 }))

  const extractedCount = documents?.filter((d) => d.status === 'extraction_complete').length ?? 0
  const failedCount = documents?.filter((d) => d.status === 'failed').length ?? 0
  const pagesRead = documents?.reduce((total, d) => total + (pagesByDocument.get(d.id)?.length ?? 0), 0) ?? 0
  const pageTotal = documents?.reduce((total, d) => total + d.page_count, 0) ?? 0

  return (
    <div className="max-w-4xl">
      <p className="text-sm text-ink-muted mb-4">Step 3 of 5 — Documents</p>

      <div className="mb-4 rounded-lg border border-brand-blue bg-brand-blue-soft px-4 py-3 text-sm">
        <p className="font-medium text-ink">What to upload</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-muted">
          <li>
            Timecards or timesheets as <span className="text-ink">PDF, JPG or PNG</span>: scans, phone photos or PDFs.
            Typed and handwritten cards both work.
          </li>
          <li>
            A PDF can hold many cards, one or two pages each. Photos work best flat, well lit and with the whole card
            in view.
          </li>
          <li>
            Up to <span className="text-ink">{formatBytes(MAX_DOCUMENT_BYTES)} per file</span> and{' '}
            <span className="text-ink">{formatBytes(MAX_UPLOAD_TOTAL_BYTES)} per upload</span>. The same file cannot be
            added twice.
          </li>
          <li>
            Then press <span className="text-ink">Process</span> to read the documents, and{' '}
            <span className="text-ink">Extract data</span> to fill in your fields.
          </li>
        </ul>
      </div>

      <DocumentDropzone jobId={jobId} />

      {documents && documents.length > 0 && (
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <h2 className="text-base font-medium text-ink">
              Your documents{' '}
              <span className="text-sm font-normal text-ink-muted">
                {extractedCount} of {documents.length} extracted · {pagesRead} of {pageTotal} pages read
                {failedCount > 0 && <span className="text-danger"> · {failedCount} failed</span>}
              </span>
            </h2>
            <p className="text-xs text-ink-muted">To replace a file, remove it and upload the new one.</p>
          </div>

          <ul className="space-y-3">
            {documents.map((doc) => {
              const pages = pagesByDocument.get(doc.id) ?? []
              const badge = STATUS_BADGE[doc.status] ?? { label: doc.status, className: 'border-line text-ink-muted' }
              const groups = groupPageStatuses(
                pageStatuses(
                  doc.page_count,
                  pages.map((p) => ({
                    pageNumber: p.page_number,
                    hasText: !purged.has(doc.id),
                    recordCount: p.extraction_records?.length ?? 0,
                  })),
                  { extracted: doc.status === 'extraction_complete', purged: purged.has(doc.id) }
                )
              )
              const failed = doc.status === 'failed' && !purged.has(doc.id)
              return (
                <li
                  key={doc.id}
                  className={`rounded-lg border bg-white px-4 py-3 ${failed ? 'border-danger' : 'border-line'}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink break-all">{doc.original_filename}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {doc.file_type.toUpperCase()}
                        {doc.file_size ? ` · ${formatBytes(doc.file_size)}` : ''} · {doc.page_count} page
                        {doc.page_count === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs ${badge.className}`}>{badge.label}</span>
                      {failed && (
                        <RetryDocumentButton
                          jobId={jobId}
                          documentId={doc.id}
                          stage={pages.length > 0 ? 'extract' : 'read'}
                          pageCount={pages.length || doc.page_count}
                        />
                      )}
                      <RemoveDocumentButton documentId={doc.id} name={doc.original_filename} hasResults={pages.length > 0} />
                    </div>
                  </div>

                  {failed && (
                    <p className="mt-2 rounded-md bg-brand-soft px-3 py-2 text-sm text-danger">
                      ✕ {pages.length > 0 ? 'Extraction failed' : 'Reading failed'}:{' '}
                      {doc.error_message ?? 'This document could not be processed.'}
                    </p>
                  )}

                  {purged.has(doc.id) && (
                    <p className="mt-2 text-xs text-ink-muted">
                      The original file and its read text were removed {RETENTION_DAYS} days after the job was last
                      changed. The extracted data is still in Review.
                    </p>
                  )}

                  {doc.status !== 'uploaded' && (
                    <ul aria-label={`Pages of ${doc.original_filename}`} className="mt-2 flex flex-wrap gap-1.5">
                      {groups.map((g) => (
                        <li
                          key={g.state}
                          title={g.pages}
                          className={`rounded-full border px-2.5 py-0.5 text-xs ${PAGE_GROUP[g.state]}`}
                        >
                          {g.attention && '⚠ '}
                          {g.pages.length > MAX_RANGE_TEXT ? `${g.count} pages` : g.pages} · {g.label}
                        </li>
                      ))}
                    </ul>
                  )}

                  {!purged.has(doc.id) && (
                    <PageViewer documentId={doc.id} readPages={pages.map((p) => p.page_number)} />
                  )}
                </li>
              )
            })}
          </ul>

          <div className="mt-4">
            <ProcessButton pendingDocumentIds={pendingOcrIds} />
            <ExtractButton jobId={jobId} pendingDocuments={pendingExtract} />
          </div>
        </div>
      )}
    </div>
  )
}
