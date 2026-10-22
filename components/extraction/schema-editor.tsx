'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GripVertical, Trash2 } from 'lucide-react'
import type { ExtractionField } from '@/types/extraction'
import {
  applyBulkChoice,
  approvalProblem,
  isDayField,
  moveItem,
  suggestsRequired,
  undecidedFields,
  type BulkChoice,
} from '@/lib/extraction/required-choice'

const TYPE_OPTIONS: { value: ExtractionField['dataType']; label: string }[] = [
  { value: 'string', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'duration', label: 'Duration (h:mm)' },
]

/** A field plus an id that stays with it while the list is reordered. */
type Row = ExtractionField & { rowId: number }

export function SchemaEditor({
  schemaId,
  initialFields,
  initialApproved,
  columns,
}: {
  schemaId: string
  initialFields: ExtractionField[]
  initialApproved: boolean
  /** Columns of the uploaded template, for choosing where each field is written. */
  columns: { id: string; label: string }[]
}) {
  const [rows, setRows] = useState<Row[]>(() => initialFields.map((f, i) => ({ ...f, rowId: i })))
  const [nextRowId, setNextRowId] = useState(initialFields.length)
  const [approved, setApproved] = useState(initialApproved)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Dragging starts only from the handle, so text in the inputs can still be selected
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  // The same, readable at once: drag events arrive before React re-renders
  const dragging = useRef<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const router = useRouter()

  const undecided = undecidedFields(rows).length
  const unmappedCount = rows.filter((f) => !f.targetColumnId).length
  const hasUndecidedDays = rows.some((f) => isDayField(f) && f.required === null)
  const hasUndecidedSuggested = rows.some((f) => suggestsRequired(f.label) && f.required === null)
  const columnLabel = useMemo(() => new Map(columns.map((c) => [c.id, c.label])), [columns])

  function update(index: number, patch: Partial<ExtractionField>) {
    setRows((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)))
    setApproved(false)
  }

  function move(from: number, to: number) {
    setRows((prev) => moveItem(prev, from, to))
    setApproved(false)
  }

  function bulk(choice: BulkChoice) {
    setRows((prev) => applyBulkChoice(prev, choice))
    setApproved(false)
  }

  function addField() {
    setRows((prev) => [
      ...prev,
      { key: `field_${nextRowId + 1}`, label: 'New field', dataType: 'string', required: null, sortOrder: prev.length, rowId: nextRowId },
    ])
    setNextRowId((n) => n + 1)
    setApproved(false)
  }

  async function save(approve: boolean) {
    setSaving(true)
    setError(null)
    // rowId only keeps a row's identity while dragging; the server ignores unknown keys
    const fields: ExtractionField[] = rows
    const res = await fetch(`/api/schema/${schemaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields, approved: approve }),
    })
    setSaving(false)
    if (!res.ok) {
      const result = await res.json().catch(() => ({}))
      setError(result.error ?? 'Your changes could not be saved. Please try again.')
      return
    }
    setApproved(approve)
    router.refresh()
  }

  async function startOver() {
    if (!confirm('This removes your current fields so you can write new instructions. Continue?')) return
    setSaving(true)
    await fetch(`/api/schema/${schemaId}`, { method: 'DELETE' })
    setSaving(false)
    router.refresh()
  }

  const blocked = approvalProblem(rows)

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-medium text-ink">Check the fields</h2>
          <p className="text-sm text-ink-muted mt-1 max-w-2xl">
            These are the values we will look for on each timecard. Rename, reorder or remove them, choose which
            Excel column each one goes into, and decide which ones every record must have.
          </p>
        </div>
        <button
          type="button"
          onClick={startOver}
          disabled={saving}
          className="text-sm border border-danger text-danger rounded-md px-3 py-1.5 hover:bg-brand-soft disabled:opacity-60"
        >
          Start over with new instructions
        </button>
      </div>

      <div className="rounded-lg border border-brand-blue bg-brand-blue-soft px-4 py-3 mb-4 text-sm text-ink">
        <p className="font-medium">Choose Required or Optional for every field</p>
        <ul className="mt-1 space-y-0.5 text-ink-muted">
          <li>
            <span className="font-medium text-ink">Required</span>: every record must have it, such as the employee ID
            or name. A record without it is flagged in Review and cannot be approved.
          </li>
          <li>
            <span className="font-medium text-ink">Optional</span>: it may be blank, such as a day off.
          </li>
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`text-sm font-medium ${undecided > 0 ? 'text-brand-strong' : 'text-success'}`}>
            {undecided > 0
              ? `${undecided} of ${rows.length} field${rows.length === 1 ? '' : 's'} still to choose`
              : '✓ Every field has a choice'}
          </span>
          {hasUndecidedSuggested && (
            <button type="button" onClick={() => bulk('suggested-required')} className={BULK_BUTTON}>
              Make the suggested fields Required
            </button>
          )}
          {hasUndecidedDays && (
            <button type="button" onClick={() => bulk('days-optional')} className={BULK_BUTTON}>
              Make all day columns (1–31) Optional
            </button>
          )}
          {undecided > 0 && (
            <button type="button" onClick={() => bulk('rest-optional')} className={BULK_BUTTON}>
              Make the rest Optional
            </button>
          )}
        </div>
      </div>

      {unmappedCount > 0 && (
        <p className="text-sm text-brand-strong mb-3">
          ⚠ {unmappedCount} field{unmappedCount === 1 ? ' is' : 's are'} not linked to an Excel column and will be left
          out of the Excel file.
        </p>
      )}

      <div className="hidden md:grid grid-cols-[1.5rem_minmax(0,1fr)_9rem_12rem_11.5rem_2rem] gap-2 px-3 pb-1 text-xs font-medium text-ink-muted">
        <span />
        <span>Field name</span>
        <span>Type of value</span>
        <span>Goes into Excel column</span>
        <span>Every record must have it?</span>
        <span />
      </div>

      <ol className="space-y-2">
        {rows.map((field, index) => {
          const isUndecided = field.required === null
          const dropHere = dropAt === index && dragFrom !== null && dragFrom !== index
          return (
            <li
              key={field.rowId}
              onDragOver={(e) => {
                if (dragging.current === null) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDropAt(index)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragging.current !== null) move(dragging.current, index)
                dragging.current = null
                setDragFrom(null)
                setDropAt(null)
              }}
              className={`grid grid-cols-[1.5rem_minmax(0,1fr)] md:grid-cols-[1.5rem_minmax(0,1fr)_9rem_12rem_11.5rem_2rem] items-center gap-2 rounded-md border px-3 py-2 bg-white ${
                isUndecided ? 'border-brand' : 'border-line'
              } ${dropHere ? 'ring-2 ring-brand-blue' : ''} ${dragFrom === index ? 'opacity-50' : ''}`}
            >
              <button
                type="button"
                aria-label={`Move ${field.label}. Drag it, or use the up and down arrow keys.`}
                title="Drag to move"
                draggable
                onDragStart={(e) => {
                  dragging.current = index
                  setDragFrom(index)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', field.label)
                  // Show the whole row moving, not just the handle
                  const row = e.currentTarget.closest('li')
                  if (row) e.dataTransfer.setDragImage(row, 16, 16)
                }}
                onDragEnd={() => {
                  dragging.current = null
                  setDragFrom(null)
                  setDropAt(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' && index > 0) {
                    e.preventDefault()
                    move(index, index - 1)
                  } else if (e.key === 'ArrowDown' && index < rows.length - 1) {
                    e.preventDefault()
                    move(index, index + 1)
                  }
                }}
                className="cursor-grab text-ink-faint hover:text-ink active:cursor-grabbing"
              >
                <GripVertical size={16} aria-hidden />
              </button>

              <div className="min-w-0">
                <input
                  value={field.label}
                  aria-label={`Name of field ${index + 1}`}
                  onChange={(e) => update(index, { label: e.target.value })}
                  className="w-full text-sm text-ink bg-transparent border-b border-transparent focus:border-line outline-none py-0.5"
                />
                {isUndecided && suggestsRequired(field.label) && (
                  <p className="text-xs text-brand-blue">Suggested: Required</p>
                )}
              </div>

              <select
                value={field.dataType}
                aria-label={`Type of value for ${field.label}`}
                onChange={(e) => update(index, { dataType: e.target.value as ExtractionField['dataType'] })}
                className="col-start-2 md:col-start-auto text-sm border border-line rounded-md px-2 py-1 bg-white"
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              <select
                value={field.targetColumnId ?? ''}
                onChange={(e) => update(index, { targetColumnId: e.target.value || null })}
                aria-label={`Excel column for ${field.label}`}
                title={field.targetColumnId ? columnLabel.get(field.targetColumnId) : 'Not written to Excel'}
                className={`col-start-2 md:col-start-auto min-w-0 text-sm border rounded-md px-2 py-1 bg-white ${
                  field.targetColumnId ? 'border-line text-ink' : 'border-brand text-brand-strong'
                }`}
              >
                <option value="">Not written to Excel</option>
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.label}
                  </option>
                ))}
              </select>

              <div
                role="radiogroup"
                aria-label={`Is ${field.label} required?`}
                className="col-start-2 md:col-start-auto inline-flex w-fit rounded-md border border-line overflow-hidden text-sm"
              >
                {([true, false] as const).map((value) => {
                  const selected = field.required === value
                  return (
                    <button
                      key={String(value)}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => update(index, { required: value })}
                      className={`px-3 py-1 ${
                        selected
                          ? value
                            ? 'bg-brand text-white'
                            : 'bg-brand-blue text-white'
                          : 'bg-white text-ink-muted hover:bg-surface'
                      } ${value ? 'border-r border-line' : ''}`}
                    >
                      {value ? 'Required' : 'Optional'}
                    </button>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  setRows((prev) => prev.filter((_, i) => i !== index))
                  setApproved(false)
                }}
                aria-label={`Remove ${field.label}`}
                title="Remove this field"
                className="col-start-2 md:col-start-auto w-fit text-ink-faint hover:text-danger"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </li>
          )
        })}
      </ol>

      <button
        type="button"
        onClick={addField}
        className="mt-3 text-sm border border-dashed border-line rounded-md px-3 py-1.5 text-ink-muted hover:text-ink"
      >
        + Add a field
      </button>

      {error && <p className="text-sm text-danger mt-4">✕ {error}</p>}

      <div className="flex flex-wrap items-center gap-3 mt-6">
        <button
          type="button"
          disabled={saving}
          onClick={() => save(false)}
          className="text-sm border border-line rounded-md px-4 py-2 disabled:opacity-60"
        >
          Save changes
        </button>
        <button
          type="button"
          disabled={saving || blocked !== null}
          onClick={() => save(true)}
          className="text-sm bg-brand text-white rounded-md px-4 py-2 disabled:opacity-50"
        >
          {approved ? 'Fields approved ✓' : 'Approve fields'}
        </button>
        {blocked && !approved && <span className="text-sm text-ink-muted">{blocked}</span>}
      </div>
    </div>
  )
}

const BULK_BUTTON = 'text-sm border border-brand-blue text-brand-blue bg-white rounded-md px-3 py-1 hover:bg-brand-blue-soft'
