'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export function ExtractButton({ jobId, pendingDocumentIds }: { jobId: string; pendingDocumentIds: string[] }) {
  const [extracting, setExtracting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [completedCount, setCompletedCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
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
    setElapsedSeconds(0)

    for (let i = 0; i < pendingDocumentIds.length; i++) {
      // Checked between documents only — the one in flight always finishes
      if (cancelRequested.current) {
        setSkippedCount(pendingDocumentIds.length - i)
        break
      }

      setCurrentIndex(i + 1)
      const res = await fetch('/api/extraction/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, documentId: pendingDocumentIds[i] }),
      })
      if (res.ok) setCompletedCount((c) => c + 1)
      else setFailedCount((f) => f + 1)
    }

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
            className="bg-[#3F6B4E] text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60"
          >
            {extracting
              ? `Extracting document ${currentIndex} of ${pendingDocumentIds.length}… (${elapsedSeconds}s)`
              : `Extract data from ${pendingDocumentIds.length} document${pendingDocumentIds.length === 1 ? '' : 's'}`}
          </button>
          {extracting && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="text-sm border border-[#B5522E] text-[#B5522E] rounded-md px-4 py-2 disabled:opacity-60"
            >
              {cancelling ? 'Stopping after this document…' : 'Cancel'}
            </button>
          )}
        </div>
      )}
      {finished && (
        <p className="text-sm text-[#5B6B78] mt-2">
          {skippedCount > 0 && 'Cancelled — '}
          {completedCount} processed, {failedCount} failed
          {skippedCount > 0 && `, ${skippedCount} not started`}.
        </p>
      )}
    </div>
  )
}
