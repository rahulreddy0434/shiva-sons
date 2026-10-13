'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function InstructionsForm({
  jobId,
  suggestedInstructions,
}: {
  jobId: string
  suggestedInstructions: string
}) {
  const [instructions, setInstructions] = useState(suggestedInstructions)
  const [loading, setLoading] = useState<'ai' | 'columns' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function generate(mode: 'ai' | 'columns') {
    setLoading(mode)
    setError(null)

    const res = await fetch('/api/schema/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, instructions, useColumns: mode === 'columns' }),
    })
    setLoading(null)

    if (!res.ok) {
      const result = await res.json()
      setError(result.error ?? 'Could not generate a schema.')
      return
    }

    router.refresh()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        generate('ai')
      }}
    >
      <label className="block text-sm font-medium mb-1">What would you like us to extract?</label>
      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        className="w-full border border-line rounded-md px-3 py-2 text-sm min-h-[90px]"
      />
      {error && <p className="text-sm text-danger mt-2">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={loading !== null || !instructions.trim()}
          className="bg-brand text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60"
        >
          {loading === 'ai' ? 'Generating fields…' : 'Generate fields'}
        </button>
        <button
          type="button"
          onClick={() => generate('columns')}
          disabled={loading !== null || !instructions.trim()}
          className="text-sm border border-brand-blue text-brand-blue rounded-md px-4 py-2 disabled:opacity-60"
        >
          {loading === 'columns' ? 'Creating fields…' : 'Use my template’s columns'}
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        “Generate fields” uses AI to work out the fields from your description. “Use my template’s columns” creates
        one field per column straight away, without AI. Either way you can edit the list before approving it, and
        your instructions are still used when the documents are read.
      </p>
    </form>
  )
}