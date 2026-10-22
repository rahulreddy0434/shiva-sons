'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { pageBatches } from '@/lib/extraction/page-batches'

/**
 * Tries one failed document again, at the step it failed at: reading it, or
 * extracting its data (in parts for a long document, like the main button).
 */
export function RetryDocumentButton({
  jobId,
  documentId,
  stage,
  pageCount,
}: {
  jobId: string
  documentId: string
  stage: 'read' | 'extract'
  pageCount: number
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function retry() {
    setBusy(true)
    setError(null)
    const calls =
      stage === 'read'
        ? [{ url: '/api/extraction/process', body: { documentId } }]
        : pageBatches(pageCount).map((part, _, parts) => ({
            url: '/api/extraction/extract',
            body: { jobId, documentId, ...(parts.length > 1 ? { fromPage: part.from, toPage: part.to } : {}) },
          }))
    for (const call of calls) {
      const res = await fetch(call.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(call.body),
      }).catch(() => null)
      if (!res?.ok) {
        const result = await res?.json().catch(() => ({}))
        setError(result?.error ?? 'Could not reach the server. Please try again.')
        break
      }
    }
    setBusy(false)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={retry}
        disabled={busy}
        className="text-sm bg-brand-blue text-white rounded-md px-3 py-1 disabled:opacity-60"
      >
        {busy ? (stage === 'read' ? 'Reading…' : 'Extracting…') : stage === 'read' ? 'Retry reading' : 'Retry extraction'}
      </button>
      {error && <span className="basis-full text-sm text-danger">✕ {error}</span>}
    </>
  )
}
