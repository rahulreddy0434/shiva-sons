'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Step 1, for a template with more than one worksheet: which sheet the
 * approved records are written into. Only that sheet is filled; the others
 * are copied into the finished file untouched.
 */
export function SheetChoice({
  jobId,
  sheets,
  chosenId,
  hasFields,
}: {
  jobId: string
  sheets: { id: string; name: string; columnCount: number }[]
  chosenId: string
  /** Fields already exist, so changing the sheet means re-linking their columns. */
  hasFields: boolean
}) {
  const [selected, setSelected] = useState(chosenId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [changed, setChanged] = useState(false)
  const router = useRouter()

  async function choose(id: string) {
    const previous = selected
    setSelected(id)
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetSheetId: id }),
    }).catch(() => null)
    setSaving(false)
    if (!res?.ok) {
      setSelected(previous)
      const result = await res?.json().catch(() => ({}))
      setError(result?.error ?? 'Could not save your choice. Please try again.')
      return
    }
    setChanged(true)
    router.refresh()
  }

  return (
    <fieldset className="rounded-lg border border-brand-blue bg-brand-blue-soft px-4 py-3">
      <legend className="px-1 text-sm font-medium text-ink">Which worksheet should the records go into?</legend>
      <p className="text-sm text-ink-muted">
        Your template has {sheets.length} worksheets. The approved records are added to the one you choose; the others
        are kept in the finished file exactly as they are.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {sheets.map((sheet) => {
          const usable = sheet.columnCount > 0
          const isSelected = selected === sheet.id
          return (
            <label
              key={sheet.id}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                isSelected ? 'border-brand bg-white text-ink' : 'border-line bg-white text-ink-muted'
              } ${usable ? 'cursor-pointer' : 'opacity-60'}`}
            >
              <input
                type="radio"
                name="target-sheet"
                value={sheet.id}
                checked={isSelected}
                disabled={!usable || saving}
                onChange={() => choose(sheet.id)}
              />
              <span>
                {sheet.name}{' '}
                <span className="text-xs text-ink-muted">
                  {usable ? `· ${sheet.columnCount} column${sheet.columnCount === 1 ? '' : 's'}` : '· no headings'}
                </span>
              </span>
            </label>
          )
        })}
      </div>
      {error && <p className="mt-2 text-sm text-danger">✕ {error}</p>}
      {changed && hasFields && (
        <p className="mt-2 text-sm text-brand-strong">
          ⚠ Your fields were set up for the other worksheet. In Step 2, check the Excel column of each field, or start
          over with new instructions.
        </p>
      )}
    </fieldset>
  )
}
