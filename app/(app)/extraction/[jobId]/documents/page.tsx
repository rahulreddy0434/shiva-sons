import { createClient } from '@/lib/supabase/server'
import { requireStep } from '@/lib/extraction/job-progress'
import { DocumentDropzone } from '@/components/upload/document-dropzone'
import { ProcessButton } from '@/components/extraction/process-button'
import { ExtractButton } from '@/components/extraction/extract-button'
import { pageStatuses, type PageState } from '@/lib/extraction/page-status'
import { RemoveDocumentButton } from '@/components/upload/remove-document-button'
import { formatBytes } from '@/lib/documents/validate-upload'
import { purgedDocumentIds, RETENTION_DAYS } from '@/lib/retention'

const PAGE_CHIP: Record<PageState, string> = {
  records: 'border-success text-success',
  continues: 'border-line text-ink-muted',
  read: 'border-brand-blue text-brand-blue',
  not_read: 'border-line text-ink-faint',
  removed: 'border-line text-ink-faint',
  empty: 'border-brand bg-brand-soft text-brand-strong',
}

interface PageRow {
  id: string
  document_id: string
  page_number: number
  // Only the read text: the stored word positions are for the review screen
  text: string | null
  extraction_records: {
    id: string
    status: string
    extracted_fields: { field_key: string; value: string | null; confidence: number | null; status: string }[]
  }[]
}

const STATUS_TEXT: Record<string, string> = {
  uploaded: 'Uploaded — not read yet',
  processing: 'Being read…',
  ocr_complete: 'Read — data not extracted yet',
  extraction_complete: '✓ Data extracted',
  needs_review: 'Needs review',
  completed: '✓ Done',
  failed: '✕ Failed',
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
      .select('id, document_id, page_number, text:ocr_raw->>text, extraction_records(id, status, extracted_fields(field_key, value, confidence, status))')
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

  return (
    <div className="max-w-4xl">
      <p className="text-sm text-ink-muted mb-4">Step 3 of 5 — Documents</p>
      <DocumentDropzone jobId={jobId} />

      {documents && documents.length > 0 && (
        <div className="mt-5 space-y-3">
          <p className="text-sm text-ink">
            {documents.filter((d) => d.status === 'extraction_complete').length} of {documents.length} document
            {documents.length === 1 ? '' : 's'} processed ·{' '}
            {documents.reduce((total, d) => total + (pagesByDocument.get(d.id)?.length ?? 0), 0)} of{' '}
            {documents.reduce((total, d) => total + d.page_count, 0)} pages read
            {documents.some((d) => d.status === 'failed') &&
              ` · ${documents.filter((d) => d.status === 'failed').length} failed`}
          </p>
          <p className="text-xs text-ink-muted">
            Check that these are the right files before processing. To replace one, remove it and upload the new file.
          </p>
          {documents.map((doc) => (
            <div key={doc.id} className="border-b border-line pb-2">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm py-1">
                <span className="min-w-0 break-all">📄 {doc.original_filename}</span>
                <span className="flex items-center gap-3 text-ink-muted text-xs">
                  <span>
                    {doc.file_type.toUpperCase()}
                    {doc.file_size ? ` · ${formatBytes(doc.file_size)}` : ''} · {doc.page_count} page
                    {doc.page_count === 1 ? '' : 's'} · {STATUS_TEXT[doc.status] ?? doc.status}
                  </span>
                  <RemoveDocumentButton
                    documentId={doc.id}
                    name={doc.original_filename}
                    hasResults={(pagesByDocument.get(doc.id)?.length ?? 0) > 0}
                  />
                </span>
              </div>

              {purged.has(doc.id) && (
                <p className="text-xs text-ink-muted">
                  The original file and its read text were removed {RETENTION_DAYS} days after the job was last
                  changed. The extracted data is still in Review.
                </p>
              )}

              {doc.status === 'failed' && !purged.has(doc.id) && (
                <p className="text-xs text-danger">
                  ✕ {doc.error_message ?? 'This document could not be processed.'} Use the button below to try again.
                </p>
              )}

              <ul aria-label={`Pages of ${doc.original_filename}`} className="mt-1 flex flex-wrap gap-1.5">
                {pageStatuses(
                  doc.page_count,
                  (pagesByDocument.get(doc.id) ?? []).map((p) => ({
                    pageNumber: p.page_number,
                    hasText: p.text !== null,
                    recordCount: p.extraction_records?.length ?? 0,
                  })),
                  { extracted: doc.status === 'extraction_complete', purged: purged.has(doc.id) }
                ).map((page) => (
                  <li
                    key={page.pageNumber}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${PAGE_CHIP[page.state]}`}
                  >
                    {page.attention && '⚠ '}Page {page.pageNumber} · {page.label}
                  </li>
                ))}
              </ul>

              {pagesByDocument.get(doc.id)?.map((p) => (
                <div key={p.id}>
                  <details className="mt-1">
                    <summary className="text-xs text-brand-blue cursor-pointer">
                      Page {p.page_number} — view extracted text
                    </summary>
                    <div className="mt-2 text-xs bg-surface border border-line rounded p-2 whitespace-pre-wrap">
                      {p.text ?? 'Removed under the retention policy.'}
                    </div>
                  </details>

                  {p.extraction_records && p.extraction_records.length > 0 && (
                    <details className="mt-1">
                      <summary className="text-xs text-success cursor-pointer">
                        Page {p.page_number} — view extracted fields
                      </summary>
                      <div className="mt-2 space-y-2">
                        {p.extraction_records.map((record) => (
                          <div key={record.id} className="text-xs bg-surface border border-line rounded p-2">
                            {record.extracted_fields.map((f) => (
                              <div key={f.field_key} className="flex justify-between py-0.5">
                                <span className="text-ink-muted">{f.field_key}</span>
                                <span>
                                  {f.value ?? <em className="text-ink-faint">missing</em>}{' '}
                                  <span className="text-ink-faint">
                                    ({Math.round((f.confidence ?? 0) * 100)}% · {f.status})
                                  </span>
                                </span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          ))}

          <ProcessButton pendingDocumentIds={pendingOcrIds} />
          <ExtractButton jobId={jobId} pendingDocuments={pendingExtract} />
        </div>
      )}
    </div>
  )
}
