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

  const busy = loading !== null || !instructions.trim()

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        generate('ai')
      }}
    >
      <h2 className="text-lg font-medium text-ink">Set up the fields to extract</h2>
      <ol className="mt-2 mb-5 text-sm text-ink-muted list-decimal pl-5 space-y-0.5">
        <li>Check the description below. We wrote it from your template; change it if anything is missing.</li>
        <li>Choose one of the two ways to create the fields.</li>
        <li>Check the fields on the next screen, then approve them.</li>
      </ol>

      <label htmlFor="instructions" className="block text-sm font-medium text-ink mb-1">
        What should we extract from each timecard?
      </label>
      <textarea
        id="instructions"
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        className="w-full border border-line rounded-md px-3 py-2 text-sm min-h-[90px]"
      />
      <p className="mt-1 text-xs text-ink-muted">
        Both ways use this description when the documents are read, so it is worth getting right.
      </p>

      <p className="mt-5 mb-2 text-sm font-medium text-ink">How should we create the fields?</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col rounded-lg border-2 border-brand bg-brand-soft p-4">
          <p className="text-sm font-medium text-ink">
            Use my template&apos;s columns{' '}
            <span className="ml-1 rounded-full bg-brand px-2 py-0.5 text-xs text-white">Recommended</span>
          </p>
          <p className="mt-1 flex-1 text-sm text-ink-muted">
            One field for each column in your Excel template, straight away and without AI. Best when your template
            already has a column for every value on the card, such as ID, NAME, 1–31 and T/HRS.
          </p>
          <button
            type="button"
            onClick={() => generate('columns')}
            disabled={busy}
            className="mt-3 w-fit bg-brand text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60"
          >
            {loading === 'columns' ? 'Creating fields…' : 'Use my template’s columns'}
          </button>
        </div>
        <div className="flex flex-col rounded-lg border border-brand-blue bg-white p-4">
          <p className="text-sm font-medium text-ink">Let AI suggest the fields</p>
          <p className="mt-1 flex-1 text-sm text-ink-muted">
            AI reads your description and template and proposes the fields. Use it when the cards name things
            differently from your template, or hold values your template does not have. Takes up to a minute.
          </p>
          <button
            type="submit"
            disabled={busy}
            className="mt-3 w-fit border border-brand-blue text-brand-blue text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60"
          >
            {loading === 'ai' ? 'Generating fields…' : 'Generate fields'}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-danger mt-3">✕ {error}</p>}
      <p className="mt-3 text-xs text-ink-muted">Either way, you can rename, reorder or remove fields before approving them.</p>
    </form>
  )
}
