'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function StarterTemplateButton({ jobId, replacing }: { jobId: string; replacing: boolean }) {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleClick() {
    if (replacing && !confirm('Replace the current template with the standard timecard template?')) return
    setWorking(true)
    setError(null)

    const res = await fetch('/api/workbooks/starter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    })
    setWorking(false)

    if (!res.ok) {
      const result = await res.json().catch(() => ({}))
      setError(result.error ?? 'The template could not be created.')
      return
    }
    router.refresh()
  }

  return (
    <div className="mt-4 text-sm text-ink-muted">
      No workbook of your own?{' '}
      <button
        type="button"
        onClick={handleClick}
        disabled={working}
        className="text-brand-blue hover:underline disabled:opacity-60"
      >
        {working ? 'Creating…' : 'Use our standard timecard template'}
      </button>
      {error && <p className="text-sm text-danger mt-2">✕ {error}</p>}
    </div>
  )
}
