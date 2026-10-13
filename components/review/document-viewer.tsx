'use client'

import { useState } from 'react'
import { RETENTION_DAYS } from '@/lib/retention'
import type { ReviewDocument } from './review-workspace'

const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3]

/**
 * Left-hand panel of the review screen: the original upload, always visible
 * beside the extracted data. PDFs use the browser's own PDF viewer (which
 * brings its zoom and rotate controls); images get zoom and rotate here.
 */
export function DocumentViewer({
  documents,
  documentId,
  pageNumber,
  attentionByDocument,
  onNavigate,
}: {
  documents: ReviewDocument[]
  documentId: string
  pageNumber: number
  attentionByDocument: Record<string, number>
  onNavigate: (documentId: string, pageNumber: number) => void
}) {
  const [zoomIndex, setZoomIndex] = useState(2)
  const [rotation, setRotation] = useState(0)

  const doc = documents.find((d) => d.id === documentId)
  const pageCount = Math.max(doc?.pages.length ?? 0, 1)
  const isPdf = doc?.fileType === 'pdf'
  const unread = doc ? doc.pages.length === 0 && !doc.purged : false

  return (
    <section
      aria-label="Original document"
      className="min-w-0 flex flex-col border border-line rounded-lg bg-white lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <label htmlFor="review-document" className="sr-only">Document</label>
        <select
          id="review-document"
          value={documentId}
          onChange={(e) => onNavigate(e.target.value, 1)}
          className="min-w-0 flex-1 text-sm border border-line rounded-md px-2 py-1 bg-white"
        >
          {documents.map((d) => {
            const attention = attentionByDocument[d.id] ?? 0
            const note =
              d.status === 'failed'
                ? ' — ✕ could not be processed'
                : attention > 0
                  ? ` — ⚠ ${attention} need${attention === 1 ? 's' : ''} attention`
                  : ''
            return (
              <option key={d.id} value={d.id}>
                {d.name}{note}
              </option>
            )
          })}
        </select>

        <div className="flex items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => onNavigate(documentId, pageNumber - 1)}
            disabled={pageNumber <= 1}
            aria-label="Previous page"
            className="border border-line rounded px-2 py-0.5 disabled:opacity-40"
          >
            ‹
          </button>
          <span className="text-xs text-ink-muted whitespace-nowrap">
            Page {pageNumber} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => onNavigate(documentId, pageNumber + 1)}
            disabled={pageNumber >= pageCount}
            aria-label="Next page"
            className="border border-line rounded px-2 py-0.5 disabled:opacity-40"
          >
            ›
          </button>
        </div>

        {!isPdf && (
          <div className="flex items-center gap-1 text-sm">
            <button
              type="button"
              onClick={() => setZoomIndex((z) => Math.max(0, z - 1))}
              disabled={zoomIndex === 0}
              aria-label="Zoom out"
              className="border border-line rounded px-2 py-0.5 disabled:opacity-40"
            >
              −
            </button>
            <span className="text-xs text-ink-muted w-10 text-center">{Math.round(ZOOM_STEPS[zoomIndex] * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoomIndex((z) => Math.min(ZOOM_STEPS.length - 1, z + 1))}
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              aria-label="Zoom in"
              className="border border-line rounded px-2 py-0.5 disabled:opacity-40"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              aria-label="Rotate"
              className="border border-line rounded px-2 py-0.5"
            >
              ⟳
            </button>
          </div>
        )}

        {doc?.url && (
          <a href={doc.url} target="_blank" rel="noreferrer" className="text-xs text-brand-blue hover:underline">
            Open in new tab
          </a>
        )}
      </div>

      {unread && (
        <p className="border-b border-line bg-brand-soft px-3 py-2 text-xs text-brand-strong">
          ⚠ This document has not been read yet{doc?.status === 'failed' ? ' — processing failed' : ''}. Go back to
          Documents to process it.
        </p>
      )}

      <div className="min-h-[60vh] flex-1 overflow-auto bg-surface lg:min-h-0">
        {doc?.purged ? (
          <p className="p-4 text-sm text-ink-muted">
            The original of this document was removed {RETENTION_DAYS} days after the job was last changed, under the
            data-retention policy. The extracted data below is still available.
          </p>
        ) : !doc?.url ? (
          <p className="p-4 text-sm text-danger">✕ The original file could not be opened.</p>
        ) : isPdf ? (
          // Keyed so that changing page reloads the viewer at that page
          <iframe
            key={`${doc.id}-${pageNumber}`}
            src={`${doc.url}#page=${pageNumber}&view=FitH&navpanes=0`}
            title={`${doc.name}, page ${pageNumber}`}
            className="h-full min-h-[60vh] w-full"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL to a private upload
          <img
            src={doc.url}
            alt={`Original upload: ${doc.name}`}
            style={{ width: `${ZOOM_STEPS[zoomIndex] * 100}%`, transform: `rotate(${rotation}deg)` }}
            className="max-w-none origin-center"
          />
        )}
      </div>
    </section>
  )
}
