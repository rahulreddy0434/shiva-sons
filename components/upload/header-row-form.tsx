'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** Shows which row the headings were found on and lets the user correct it. */
export function HeaderRowForm({ sheetId, headerRow, maxRow }: { sheetId: string; headerRow: number; maxRow: number }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(headerRow))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setNote(null)

    const res = await fetch('/api/workbooks/header-row', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetId, headerRow: Number(value) }),
    })
    const result = await res.json().catch(() => ({}))
    setSaving(false)

    if (!res.ok) {
      setError(result.error ?? 'That row could not be used.')
      return
    }
    if (result.unlinkedFields > 0) {
      setNote(
        `${result.unlinkedFields} field${result.unlinkedFields === 1 ? ' is' : 's are'} no longer linked to a column — check them in Step 2.`
      )
    }
    setEditing(false)
    router.refresh()
  }

  if (!editing) {
    return (
      <span className="text-xs text-ink-muted">
        <button type="button" onClick={() => setEditing(true)} className="text-brand-blue hover:underline">
          Wrong row?
        </button>
        {note && <span className="ml-2 text-brand-strong">⚠ {note}</span>}
      </span>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="inline-flex flex-wrap items-center gap-2 text-xs">
      <label htmlFor={`header-row-${sheetId}`} className="text-ink-muted">Headings are on row</label>
      <input
        id={`header-row-${sheetId}`}
        type="number"
        min={1}
        max={maxRow}
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-16 border border-line rounded px-2 py-1 text-sm"
      />
      <button type="submit" disabled={saving} className="border border-brand-blue text-brand-blue rounded px-2 py-1 disabled:opacity-60">
        {saving ? 'Reading…' : 'Use this row'}
      </button>
      <button type="button" onClick={() => setEditing(false)} disabled={saving} className="text-ink-muted hover:underline">
        Cancel
      </button>
      {error && <span className="text-danger">✕ {error}</span>}
    </form>
  )
}
