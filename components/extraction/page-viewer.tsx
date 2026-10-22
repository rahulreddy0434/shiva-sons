'use client'

import { useEffect, useState } from 'react'

interface PageData {
  text: string | null
  records: { label: string; value: string | null }[][]
}

/**
 * "What was read from this document": one page at a time, with a page picker,
 * so a long document stays quick to open. Shown under a document once it has
 * been read.
 */
export function PageViewer({ documentId, readPages }: { documentId: string; readPages: number[] }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(readPages[0] ?? 1)
  const [loaded, setLoaded] = useState<{ page: number; data?: PageData; error?: string } | null>(null)
  const position = readPages.indexOf(page)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch(`/api/documents/${documentId}/pages/${page}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        setLoaded(res.ok ? { page, data: body } : { page, error: body.error ?? 'This page could not be loaded.' })
      })
      .catch(() => !cancelled && setLoaded({ page, error: 'Could not reach the server. Please try again.' }))
    return () => {
      cancelled = true
    }
  }, [open, page, documentId])

  if (readPages.length === 0) return null
  const current = loaded?.page === page ? loaded : null

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-sm text-brand-blue hover:underline"
      >
        {open ? '▾ Hide what was read' : '▸ See what was read from each page'}
      </button>

      {open && (
        <div className="mt-2 rounded-md border border-line bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setPage(readPages[position - 1])}
              disabled={position <= 0}
              className="border border-line bg-white rounded px-2 py-0.5 disabled:opacity-40"
              aria-label="Previous page"
            >
              ‹
            </button>
            <label className="flex items-center gap-1">
              <span className="sr-only">Page</span>
              <select
                value={page}
                onChange={(e) => setPage(Number(e.target.value))}
                className="border border-line bg-white rounded px-2 py-0.5"
              >
                {readPages.map((n) => (
                  <option key={n} value={n}>
                    Page {n}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-ink-muted">of {readPages.length} read</span>
            <button
              type="button"
              onClick={() => setPage(readPages[position + 1])}
              disabled={position >= readPages.length - 1}
              className="border border-line bg-white rounded px-2 py-0.5 disabled:opacity-40"
              aria-label="Next page"
            >
              ›
            </button>
          </div>

          {!current && <p className="mt-3 text-sm text-ink-muted">Loading page {page}…</p>}
          {current?.error && <p className="mt-3 text-sm text-danger">✕ {current.error}</p>}
          {current?.data && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-ink-muted mb-1">Text read from the page</p>
                <div className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-line bg-white p-2 text-xs text-ink">
                  {current.data.text ?? 'Removed under the 30-day retention policy.'}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-ink-muted mb-1">
                  {current.data.records.length === 0
                    ? 'No record starts on this page'
                    : `Values extracted (${current.data.records.length} record${current.data.records.length === 1 ? '' : 's'})`}
                </p>
                {current.data.records.map((fields, i) => (
                  <dl key={i} className="mb-2 max-h-72 overflow-auto rounded border border-line bg-white p-2 text-xs">
                    {fields.map((f) => (
                      <div key={f.label} className="flex justify-between gap-3 py-0.5">
                        <dt className="text-ink-muted">{f.label}</dt>
                        <dd className="text-ink">{f.value ?? <em className="text-ink-faint">blank</em>}</dd>
                      </div>
                    ))}
                  </dl>
                ))}
                {current.data.records.length > 0 && (
                  <p className="text-xs text-ink-muted">Check and correct these side by side with the page in Review.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
