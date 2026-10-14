'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { pageBatches } from '@/lib/extraction/page-batches'

export function ExtractButton({
  jobId,
  pendingDocuments,
}: {
  jobId: string
  /** Documents waiting for extraction, with how many pages OCR read in each. */
  pendingDocuments: { id: string; pageCount: number }[]
}) {
  const pendingDocumentIds = pendingDocuments.map((d) => d.id)
  const [extracting, setExtracting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  // Shown while a long document is extracted in parts
  const [currentPart, setCurrentPart] = useState<string | null>(null)
  const [completedCount, setCompletedCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [failureReasons, setFailureReasons] = useState<string[]>([])
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const cancelRequested = useRef(false)
  const router = useRouter()

  useEffect(() => {
    if (!extracting) return
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [extracting])

  async function handleExtract() {
    cancelRequested.current = false
    setExtracting(true)
    setCancelling(false)
    setCurrentIndex(0)
    setCompletedCount(0)
    setFailedCount(0)
    setSkippedCount(0)
    setFailureReasons([])
    setElapsedSeconds(0)

    documents: for (let i = 0; i < pendingDocuments.length; i++) {
      setCurrentIndex(i + 1)
      const { id: documentId, pageCount } = pendingDocuments[i]
      // A long document goes in parts; a short one in a single call
      const parts = pageBatches(pageCount)

      for (const part of parts) {
        // Checked between calls only — the one in flight always finishes. A
        // document stopped part-way stays waiting and is redone from its start.
        if (cancelRequested.current) {
          setSkippedCount(pendingDocuments.length - i)
          break documents
        }
        setCurrentPart(parts.length > 1 ? `pages ${part.from}–${part.to} of ${pageCount}` : null)

        const res = await fetch('/api/extraction/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            documentId,
            ...(parts.length > 1 ? { fromPage: part.from, toPage: part.to } : {}),
          }),
        })
        if (!res.ok) {
          setFailedCount((f) => f + 1)
          const result = await res.json().catch(() => ({}))
          const reason: string = result.error ?? 'Something went wrong.'
          setFailureReasons((prev) => (prev.includes(reason) ? prev : [...prev, reason]))
          continue documents
        }
      }
      setCompletedCount((c) => c + 1)
    }

    setCurrentPart(null)
    setExtracting(false)
    setCancelling(false)
    router.refresh()
  }

  function handleCancel() {
    cancelRequested.current = true
    setCancelling(true)
  }

  const finished = !extracting && (completedCount > 0 || failedCount > 0 || skippedCount > 0)
  if (pendingDocumentIds.length === 0 && !finished) return null

  return (
    <div className="mt-3">
      {(pendingDocumentIds.length > 0 || extracting) && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExtract}
            disabled={extracting}
            className="bg-brand-blue text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60"
          >
            {extracting
              ? `Extracting document ${currentIndex} of ${pendingDocumentIds.length}${currentPart ? `, ${currentPart}` : ''}… (${elapsedSeconds}s)`
              : `Extract data from ${pendingDocumentIds.length} document${pendingDocumentIds.length === 1 ? '' : 's'}`}
          </button>
          {extracting && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="text-sm border border-danger text-danger rounded-md px-4 py-2 disabled:opacity-60"
            >
              {cancelling ? (currentPart ? 'Stopping after these pages…' : 'Stopping after this document…') : 'Cancel'}
            </button>
          )}
        </div>
      )}
      {finished && (
        <p className="text-sm text-ink-muted mt-2">
          {skippedCount > 0 && 'Cancelled — '}
          {completedCount} processed, {failedCount} failed
          {skippedCount > 0 && `, ${skippedCount} not finished`}.
        </p>
      )}
      {!extracting &&
        failureReasons.map((reason) => (
          <p key={reason} className="text-sm text-danger mt-1">
            ✕ {reason}
          </p>
        ))}
    </div>
  )
}
