'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RemoveDocumentButton({
  documentId,
  name,
  hasResults,
}: {
  documentId: string
  name: string
  /** True once the document has been read, so removing it also discards extracted data. */
  hasResults: boolean
}) {
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleRemove() {
    const warning = hasResults
      ? `Remove ${name}? Everything read and extracted from it, including your corrections, will be deleted. This can’t be undone.`
      : `Remove ${name}?`
    if (!confirm(warning)) return

    setRemoving(true)
    setError(null)
    const res = await fetch(`/api/documents/${documentId}`, { method: 'DELETE' })
    setRemoving(false)

    if (!res.ok) {
      const result = await res.json().catch(() => ({}))
      setError(result.error ?? 'Could not remove this document.')
      return
    }
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={handleRemove}
        disabled={removing}
        className="text-xs text-danger hover:underline disabled:opacity-60"
      >
        {removing ? 'Removing…' : 'Remove'}
      </button>
      {error && <span className="text-xs text-danger">✕ {error}</span>}
    </>
  )
}
