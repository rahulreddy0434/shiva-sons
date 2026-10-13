'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export function ProcessButton({ pendingDocumentIds }: { pendingDocumentIds: string[] }) {
  const [processing, setProcessing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [completedCount, setCompletedCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [failureReasons, setFailureReasons] = useState<string[]>([])
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const cancelRequested = useRef(false)
  const router = useRouter()

  useEffect(() => {
    if (!processing) return
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [processing])

  async function handleProcess() {
    cancelRequested.current = false
    setProcessing(true)
    setCancelling(false)
    setCurrentIndex(0)
    setCompletedCount(0)
    setFailedCount(0)
    setSkippedCount(0)
    setFailureReasons([])
    setElapsedSeconds(0)

    for (let i = 0; i < pendingDocumentIds.length; i++) {
      // Checked between documents only — the one in flight always finishes
      if (cancelRequested.current) {
        setSkippedCount(pendingDocumentIds.length - i)
        break
      }

      setCurrentIndex(i + 1)
      const res = await fetch('/api/extraction/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: pendingDocumentIds[i] }),
      })
      if (res.ok) {
        setCompletedCount((c) => c + 1)
      } else {
        setFailedCount((f) => f + 1)
        const result = await res.json().catch(() => ({}))
        const reason: string = result.error ?? 'Something went wrong.'
        setFailureReasons((prev) => (prev.includes(reason) ? prev : [...prev, reason]))
      }
    }

    setProcessing(false)
    setCancelling(false)
    router.refresh()
  }

  function handleCancel() {
    cancelRequested.current = true
    setCancelling(true)
  }

  const finished = !processing && (completedCount > 0 || failedCount > 0 || skippedCount > 0)
  if (pendingDocumentIds.length === 0 && !finished) return null

  return (
    <div className="mt-4">
      {(pendingDocumentIds.length > 0 || processing) && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleProcess}
            disabled={processing}
            className="bg-brand text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60"
          >
            {processing
              ? `Reading document ${currentIndex} of ${pendingDocumentIds.length}… (${elapsedSeconds}s)`
              : `Process ${pendingDocumentIds.length} document${pendingDocumentIds.length === 1 ? '' : 's'} (OCR)`}
          </button>
          {processing && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="text-sm border border-danger text-danger rounded-md px-4 py-2 disabled:opacity-60"
            >
              {cancelling ? 'Stopping after this document…' : 'Cancel'}
            </button>
          )}
        </div>
      )}
      {finished && (
        <p className="text-sm text-ink-muted mt-2">
          {skippedCount > 0 && 'Cancelled — '}
          {completedCount} processed, {failedCount} failed
          {skippedCount > 0 && `, ${skippedCount} not started`}.
        </p>
      )}
      {!processing &&
        failureReasons.map((reason) => (
          <p key={reason} className="text-sm text-danger mt-1">
            ✕ {reason}
          </p>
        ))}
    </div>
  )
}
