'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { JobSummary } from '@/lib/review/job-summary'

export interface SheetOption {
  id: string
  name: string
  mappedCount: number
  unmapped: string[]
  blockers: string[]
}

export interface ExportEntry {
  id: string
  filename: string
  createdAt: string
  recordCount: number | null
  /** Short-lived signed link; null if the file could not be found. */
  url: string | null
  /** False when the data was edited or re-approved after this file was made. */
  current: boolean
}

export function ApprovalPanel({
  jobId,
  summary,
  documentCount,
  pageCount,
  failedDocuments,
  templateName,
  fieldCount,
  sheets,
  initialSheetId,
  approval,
  exports,
}: {
  jobId: string
  summary: JobSummary
  documentCount: number
  pageCount: number
  failedDocuments: string[]
  templateName: string | null
  fieldCount: number
  sheets: SheetOption[]
  initialSheetId: string
  approval: { approvedAt: string; sheetName: string | null; recordCount: number } | null
  exports: ExportEntry[]
}) {
  const router = useRouter()
  const [sheetId, setSheetId] = useState(initialSheetId)
  const [confirming, setConfirming] = useState(false)
  // Approving while documents were left out takes an explicit tick
  const [withoutDocuments, setWithoutDocuments] = useState(false)
  const [busy, setBusy] = useState<'approve' | 'export' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exportNote, setExportNote] = useState<string | null>(null)

  const sheet = sheets.find((s) => s.id === sheetId)
  const blockers = sheet?.blockers ?? ['Upload an Excel template in Step 1 first.']
  const reviewHref = `/extraction/${jobId}/review`

  async function post(action: 'approve' | 'export', body?: unknown) {
    setBusy(action)
    setError(null)
    setExportNote(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(result.error ?? 'That did not work. Please try again.')
        return
      }
      if (action === 'export') {
        // Start the download; the file also stays in the list below
        if (result.downloadUrl) window.location.assign(result.downloadUrl)
        setExportNote(
          `${result.rowsWritten} record${result.rowsWritten === 1 ? '' : 's'} written starting at row ${result.firstRow}.` +
            (result.formulaCellsKept > 0
              ? ` ${result.formulaCellsKept} formula cell${result.formulaCellsKept === 1 ? ' was' : 's were'} left as your template has them.`
              : '')
        )
      }
      setConfirming(false)
      router.refresh()
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const rows: [string, string | number][] = [
    ['Documents processed', documentCount],
    ['Pages read', pageCount],
    ['Records extracted', summary.recordCount],
    ['Records you corrected', summary.correctedCount],
    ['Records marked reviewed', summary.reviewedCount],
    ['Records with no issues, not marked reviewed', summary.notReviewedCount],
    ['Records still needing attention', summary.blockingRecordCount + summary.warningRecordCount],
    ['Excel template', templateName ?? '—'],
  ]

  return (
    <div className="space-y-8">
      <section aria-labelledby="approval-heading">
        <h2 id="approval-heading" className="text-base font-medium text-ink">1. Approve the reviewed data</h2>

        <dl className="mt-3 border border-line rounded-lg divide-y divide-line">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="text-ink font-medium text-right break-all">{value}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
            <dt className="text-ink-muted">
              <label htmlFor="target-sheet">Worksheet to fill</label>
            </dt>
            <dd>
              {sheets.length > 0 ? (
                <select
                  id="target-sheet"
                  value={sheetId}
                  onChange={(e) => setSheetId(e.target.value)}
                  disabled={busy !== null}
                  className="text-sm border border-line rounded-md px-2 py-1 bg-white"
                >
                  {sheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.mappedCount} of {fieldCount} fields match a column
                    </option>
                  ))}
                </select>
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>

        {failedDocuments.length > 0 && (
          <p className="mt-3 text-sm text-brand-strong">
            ⚠ {failedDocuments.length} document{failedDocuments.length === 1 ? ' is' : 's are'} not included, because{' '}
            {failedDocuments.length === 1 ? 'it was' : 'they were'} not extracted: {failedDocuments.join(', ')}. Go back to
            Documents to retry, or confirm below that you want to approve without {failedDocuments.length === 1 ? 'it' : 'them'}.
          </p>
        )}

        {sheet && sheet.unmapped.length > 0 && (
          <p className="mt-3 text-sm text-brand-strong">
            ⚠ These fields have no matching column on this worksheet and will not be in the Excel file:{' '}
            {sheet.unmapped.join(', ')}.
          </p>
        )}

        {blockers.length > 0 ? (
          <div className="mt-4 border border-danger rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-danger">✕ This job cannot be approved yet</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-ink space-y-0.5">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <Link href={reviewHref} className="mt-2 inline-block text-sm text-brand-blue hover:underline">
              Go to Review →
            </Link>
          </div>
        ) : approval ? (
          <p className="mt-4 text-sm text-success">
            ✓ Approved on {new Date(approval.approvedAt).toLocaleString()} — {approval.recordCount} record
            {approval.recordCount === 1 ? '' : 's'}
            {approval.sheetName ? `, worksheet “${approval.sheetName}”` : ''}. Editing any record cancels this approval.
          </p>
        ) : confirming ? (
          <div className="mt-4 border border-brand rounded-lg bg-brand-soft px-4 py-3">
            <p className="text-sm text-ink">
              You are confirming that {summary.recordCount} record{summary.recordCount === 1 ? ' is' : 's are'} correct
              and ready to go into your workbook.
              {summary.notReviewedCount > 0 &&
                ` ${summary.notReviewedCount} of them ${summary.notReviewedCount === 1 ? 'has' : 'have'} not been individually marked reviewed.`}
            </p>
            {failedDocuments.length > 0 && (
              <label className="mt-3 flex items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={withoutDocuments}
                  onChange={(e) => setWithoutDocuments(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Approve without {failedDocuments.length === 1 ? 'this document' : `these ${failedDocuments.length} documents`}:{' '}
                  {failedDocuments.join(', ')}. Their cards will not be in the Excel file.
                </span>
              </label>
            )}
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => post('approve', { sheetId, withoutDocuments })}
                disabled={busy !== null || (failedDocuments.length > 0 && !withoutDocuments)}
                className="bg-brand text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60"
              >
                {busy === 'approve' ? 'Approving…' : 'Yes, approve'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy !== null}
                className="text-sm border border-line bg-white rounded-md px-4 py-2 disabled:opacity-60"
              >
                Not yet
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-4 bg-brand text-white text-sm font-medium rounded-md px-4 py-2"
          >
            Approve {summary.recordCount} record{summary.recordCount === 1 ? '' : 's'}
          </button>
        )}
      </section>

      <section aria-labelledby="export-heading">
        <h2 id="export-heading" className="text-base font-medium text-ink">2. Generate the completed workbook</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Records are added below any rows already in your template. Cells that hold a formula in your template are
          left as they are, and nothing outside the matched columns is changed.
        </p>

        <button
          type="button"
          onClick={() => post('export')}
          disabled={!approval || blockers.length > 0 || busy !== null}
          className="mt-3 bg-brand-blue text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-50"
        >
          {busy === 'export' ? 'Generating…' : 'Generate Excel file'}
        </button>
        {!approval && blockers.length === 0 && (
          <p className="mt-2 text-xs text-ink-muted">Approve the data first.</p>
        )}
        {exportNote && <p className="mt-2 text-sm text-success">✓ {exportNote}</p>}
        {error && <p className="mt-2 text-sm text-danger">✕ {error}</p>}

        {exports.length > 0 && (
          <ul className="mt-4 border border-line rounded-lg divide-y divide-line">
            {exports.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-ink break-all">{file.filename}</p>
                  <p className="text-xs text-ink-muted">
                    {new Date(file.createdAt).toLocaleString()}
                    {file.recordCount !== null && ` · ${file.recordCount} record${file.recordCount === 1 ? '' : 's'}`}
                    {!file.current && ' · ⚠ made before the latest changes'}
                  </p>
                </div>
                {file.url ? (
                  <a
                    href={file.url}
                    className="shrink-0 border border-brand-blue text-brand-blue rounded-md px-3 py-1.5 text-sm font-medium"
                  >
                    Download
                  </a>
                ) : (
                  <span className="text-xs text-danger">✕ File not found</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
