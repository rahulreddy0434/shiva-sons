'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ProcessButton({ jobId, pendingCount }: { jobId: string; pendingCount: number }) {
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<{ processed: number; failed: number } | null>(null)
  const router = useRouter()

  async function handleProcess() {
    setProcessing(true)
    setResult(null)
    const res = await fetch('/api/extraction/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    })
    const data = await res.json()
    setProcessing(false)
    setResult(data)
    router.refresh()
  }

  if (pendingCount === 0) return null

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={handleProcess}
        disabled={processing}
        className="bg-[#A97C33] text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60"
      >
        {processing ? 'Reading documents…' : `Process ${pendingCount} document${pendingCount === 1 ? '' : 's'} (OCR)`}
      </button>
      {result && (
        <p className="text-sm text-[#5B6B78] mt-2">
          {result.processed} processed, {result.failed} failed.
        </p>
      )}
    </div>
  )
}