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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/schema/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, instructions }),
    })
    setLoading(false)

    if (!res.ok) {
      const result = await res.json()
      setError(result.error ?? 'Could not generate a schema.')
      return
    }

    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit}>
      <label className="block text-sm font-medium mb-1">What would you like us to extract?</label>
      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        className="w-full border border-[#DADDD5] rounded-md px-3 py-2 text-sm min-h-[90px]"
      />
      {error && <p className="text-sm text-[#B5522E] mt-2">{error}</p>}
      <button
        type="submit"
        disabled={loading || !instructions.trim()}
        className="mt-3 bg-[#A97C33] text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60"
      >
        {loading ? 'Generating fields…' : 'Generate fields'}
      </button>
    </form>
  )
}