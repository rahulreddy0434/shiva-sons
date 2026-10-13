'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ExtractionField } from '@/types/extraction'
import {
  reviewState,
  type FieldIssue,
  type FieldValue,
  type ReviewState,
} from '@/lib/validation/validate-record'
import { validateRecords } from '@/lib/validation/cross-checks'
import { groupFields } from '@/lib/review/group-fields'
import { DocumentViewer } from './document-viewer'

export interface ReviewPage {
  id: string
  pageNumber: number
  /** What OCR read on this page, shown on request so a value can be traced to its source. */
  text: string
}

export interface ReviewDocument {
  id: string
  name: string
  fileType: string
  status: string
  /** Short-lived signed URL; null if the file could not be opened. */
  url: string | null
  pages: ReviewPage[]
}

export interface ReviewRecord {
  id: string
  pageId: string
  reviewed: boolean
  source: string
  values: Record<string, FieldValue & { original: string | null }>
}

type Filter = 'all' | 'needs_attention' | 'reviewed'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All records' },
  { id: 'needs_attention', label: 'Needs attention' },
  { id: 'reviewed', label: 'Reviewed' },
]

const INPUT_TYPE_HINT: Record<ExtractionField['dataType'], string> = {
  string: '',
  date: 'YYYY-MM-DD',
  time: 'HH:MM',
  duration: 'minutes or H:MM',
  number: 'number',
}

export function ReviewWorkspace({
  fields,
  documents,
  records,
}: {
  fields: ExtractionField[]
  documents: ReviewDocument[]
  records: ReviewRecord[]
}) {
  const router = useRouter()
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? '')
  const [pageNumber, setPageNumber] = useState(1)
  const [filter, setFilter] = useState<Filter>('all')
  // Unsaved edits only: recordId → fieldKey → typed value
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({})
  const [busyRecordId, setBusyRecordId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState(false)

  const pageLookup = useMemo(() => {
    const map = new Map<string, { documentId: string; pageNumber: number }>()
    for (const doc of documents) {
      for (const page of doc.pages) map.set(page.id, { documentId: doc.id, pageNumber: page.pageNumber })
    }
    return map
  }, [documents])

  // Each record with its values as currently shown (saved value + unsaved edits) and validated
  const evaluated = useMemo(() => {
    const shownByRecord = records.map((record) => {
      const draft = drafts[record.id] ?? {}
      const values: Record<string, FieldValue> = {}
      for (const field of fields) {
        const saved = record.values[field.key]
        if (field.key in draft && draft[field.key] !== (saved?.value ?? '')) {
          values[field.key] = { value: draft[field.key], status: 'user_corrected', confidence: saved?.confidence }
        } else if (saved) {
          values[field.key] = saved
        }
      }
      return { id: record.id, values }
    })

    // Checked together: a total against its cells, and records against each other
    const issuesByRecord = validateRecords(fields, shownByRecord)

    return records.map((record) => {
      const draft = drafts[record.id] ?? {}
      const issues = issuesByRecord.get(record.id) ?? []
      const location = pageLookup.get(record.pageId)
      return {
        record,
        issues,
        state: reviewState(issues, record.reviewed),
        dirty: fields.some((f) => f.key in draft && draft[f.key] !== (record.values[f.key]?.value ?? '')),
        documentId: location?.documentId ?? '',
        pageNumber: location?.pageNumber ?? 1,
      }
    })
  }, [records, drafts, fields, pageLookup])

  const counts: Record<Filter, number> = {
    all: evaluated.length,
    needs_attention: evaluated.filter((e) => e.state === 'needs_attention').length,
    reviewed: evaluated.filter((e) => e.state === 'reviewed').length,
  }

  const currentDocument = documents.find((d) => d.id === documentId)
  const currentPage = currentDocument?.pages.find((p) => p.pageNumber === pageNumber)
  const visible = evaluated
    .filter((e) => e.documentId === documentId)
    .filter((e) => filter === 'all' || e.state === filter)
    .sort((a, b) => a.pageNumber - b.pageNumber)

  function goTo(nextDocumentId: string, nextPage: number) {
    setDocumentId(nextDocumentId)
    setPageNumber(nextPage)
  }

  function goToNextAttention() {
    const next = evaluated.find((e) => e.state === 'needs_attention')
    if (!next) return
    setFilter('needs_attention')
    goTo(next.documentId, next.pageNumber)
  }

  function setDraft(recordId: string, key: string, value: string) {
    setDrafts((prev) => ({ ...prev, [recordId]: { ...prev[recordId], [key]: value } }))
  }

  async function send(recordId: string, init: RequestInit, onSuccess?: () => void) {
    setBusyRecordId(recordId)
    setErrors((prev) => ({ ...prev, [recordId]: '' }))
    try {
      const res = await fetch(`/api/records/${recordId}`, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const result = await res.json().catch(() => ({}))
        setErrors((prev) => ({ ...prev, [recordId]: result.error ?? 'That did not save. Please try again.' }))
        return
      }
      onSuccess?.()
      router.refresh()
    } catch {
      setErrors((prev) => ({ ...prev, [recordId]: 'Could not reach the server. Your edits are still here — try again.' }))
    } finally {
      setBusyRecordId(null)
    }
  }

  function save(record: ReviewRecord, alsoMarkReviewed: boolean) {
    const draft = drafts[record.id] ?? {}
    const edits = Object.entries(draft)
      .filter(([key, value]) => value !== (record.values[key]?.value ?? ''))
      .map(([key, value]) => ({ key, value }))

    return send(
      record.id,
      {
        method: 'PATCH',
        body: JSON.stringify({ fields: edits, ...(alsoMarkReviewed ? { reviewed: true } : {}) }),
      },
      () => setDrafts((prev) => ({ ...prev, [record.id]: {} }))
    )
  }

  function remove(record: ReviewRecord) {
    if (!confirm('Remove this record? Its values and corrections will be deleted. This can’t be undone.')) return
    return send(record.id, { method: 'DELETE' })
  }

  async function addRecord() {
    if (!currentPage) return
    setAdding(true)
    const res = await fetch('/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentPageId: currentPage.id }),
    })
    setAdding(false)
    if (res.ok) {
      setFilter('all')
      router.refresh()
    }
  }

  if (documents.length === 0) {
    return <p className="text-sm text-ink-muted">No documents have been uploaded for this job yet.</p>
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <DocumentViewer
        documents={documents}
        documentId={documentId}
        pageNumber={pageNumber}
        attentionByDocument={Object.fromEntries(
          documents.map((d) => [
            d.id,
            evaluated.filter((e) => e.documentId === d.id && e.state === 'needs_attention').length,
          ])
        )}
        onNavigate={goTo}
      />

      <section aria-label="Extracted data" className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`text-xs rounded-full border px-3 py-1 ${
                filter === f.id
                  ? 'border-brand-blue bg-brand-blue-soft text-brand-blue font-medium'
                  : 'border-line text-ink-muted'
              }`}
            >
              {f.label} ({counts[f.id]})
            </button>
          ))}
          {counts.needs_attention > 0 && (
            <button type="button" onClick={goToNextAttention} className="ml-auto text-xs text-brand-blue hover:underline">
              Go to next record needing attention →
            </button>
          )}
        </div>

        <div className="mt-4 space-y-4">
          {visible.length === 0 && (
            <p className="text-sm text-ink-muted border border-dashed border-line rounded-md p-4">
              {filter === 'all'
                ? 'No records were extracted from this document.'
                : 'No records in this document match that filter.'}
            </p>
          )}

          {visible.map(({ record, issues, state, dirty, pageNumber: recordPage }, index) => (
            <RecordCard
              key={record.id}
              title={`Record ${index + 1}`}
              pageNumber={recordPage}
              record={record}
              fields={fields}
              draft={drafts[record.id] ?? {}}
              issues={issues}
              state={state}
              dirty={dirty}
              busy={busyRecordId === record.id}
              error={errors[record.id]}
              onShowPage={() => goTo(documentId, recordPage)}
              onChange={(key, value) => setDraft(record.id, key, value)}
              onSave={() => save(record, false)}
              onMarkReviewed={() => save(record, true)}
              onUnmarkReviewed={() =>
                send(record.id, { method: 'PATCH', body: JSON.stringify({ reviewed: false }) })
              }
              onRemove={() => remove(record)}
            />
          ))}

          {currentPage && (
            <button
              type="button"
              onClick={addRecord}
              disabled={adding}
              className="text-xs border border-dashed border-line rounded px-3 py-1.5 text-ink-muted disabled:opacity-60"
            >
              {adding ? 'Adding…' : `+ Add a record for page ${pageNumber}`}
            </button>
          )}

          {currentPage?.text && (
            <details className="text-xs">
              <summary className="cursor-pointer text-brand-blue">Text read from page {pageNumber}</summary>
              <div className="mt-2 bg-surface border border-line rounded p-2 whitespace-pre-wrap">{currentPage.text}</div>
            </details>
          )}
        </div>
      </section>
    </div>
  )
}

interface FieldState {
  saved: ReviewRecord['values'][string] | undefined
  /** What the input shows: the unsaved edit if there is one, otherwise the saved value. */
  value: string
  issue: FieldIssue | undefined
  edited: boolean
  corrected: boolean
}

function borderClass(issue: FieldIssue | undefined): string {
  if (issue?.severity === 'blocking') return 'border-danger'
  return issue ? 'border-brand' : 'border-line'
}

/**
 * A run of same-typed cells (a month of day columns) as a compact grid, so
 * it can be checked against the card row by row instead of as 31 form rows.
 * Every cell carries a symbol as well as a border colour.
 */
function SeriesGrid({
  recordId,
  fields,
  state,
  onChange,
}: {
  recordId: string
  fields: ExtractionField[]
  state: (field: ExtractionField) => FieldState
  onChange: (key: string, value: string) => void
}) {
  const cells = fields.map((field) => ({ field, ...state(field) }))
  const problems = cells.filter((c) => c.issue)
  const first = fields[0].label
  const last = fields[fields.length - 1].label

  const numbers = cells.map((c) => (c.value.trim() === '' ? 0 : Number(c.value)))
  const sum = numbers.every(Number.isFinite) ? numbers.reduce((a, b) => a + b, 0) : null

  return (
    <fieldset className="border border-line rounded-md px-3 py-2">
      <legend className="px-1 text-xs text-ink-muted">
        Columns {first}–{last}
        {fields[0].dataType === 'number' && sum !== null && (
          <span className="text-ink"> · adds up to {Math.round(sum * 100) / 100}</span>
        )}
      </legend>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-x-1.5 gap-y-2">
        {cells.map(({ field, value, issue, edited, corrected }) => {
          const inputId = `${recordId}-${field.key}`
          const mark = issue?.severity === 'blocking' ? '✕' : issue ? '⚠' : edited ? '●' : corrected ? '✎' : ''
          const markLabel =
            issue?.message ?? (edited ? 'Edited, not saved yet' : corrected ? 'Corrected by you' : undefined)
          return (
            <div key={field.key} className="text-center">
              <label htmlFor={inputId} className="block text-[11px] leading-4 text-ink-muted">
                {field.label}
                {mark && (
                  <span
                    title={markLabel}
                    className={
                      issue?.severity === 'blocking' ? 'text-danger' : issue ? 'text-brand-strong' : 'text-ink-muted'
                    }
                  >
                    {' '}
                    {mark}
                  </span>
                )}
              </label>
              <input
                id={inputId}
                value={value}
                onChange={(e) => onChange(field.key, e.target.value)}
                inputMode={field.dataType === 'number' ? 'decimal' : undefined}
                aria-invalid={issue?.severity === 'blocking'}
                aria-label={`Column ${field.label}${markLabel ? ` — ${markLabel}` : ''}`}
                className={`w-full text-sm text-center rounded border px-1 py-0.5 bg-white ${borderClass(issue)}`}
              />
            </div>
          )
        })}
      </div>

      {problems.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {problems.map(({ field, issue }) => (
            <li
              key={field.key}
              className={`text-xs ${issue!.severity === 'blocking' ? 'text-danger' : 'text-brand-strong'}`}
            >
              {issue!.severity === 'blocking' ? '✕' : '⚠'} Column {field.label}:{' '}
              {issue!.message.startsWith(field.label) ? issue!.message.slice(field.label.length).trim() : issue!.message}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-ink-faint">
        ✕ must be fixed · ⚠ check against the document · ✎ corrected by you · ● not saved yet
      </p>
    </fieldset>
  )
}

const STATE_BADGE: Record<ReviewState, { label: string; className: string }> = {
  needs_attention: { label: '⚠ Needs attention', className: 'border-brand text-brand-strong bg-brand-soft' },
  reviewed: { label: '✓ Reviewed', className: 'border-success text-success' },
  ready: { label: 'Not yet reviewed', className: 'border-line text-ink-muted' },
}

function RecordCard({
  title,
  pageNumber,
  record,
  fields,
  draft,
  issues,
  state,
  dirty,
  busy,
  error,
  onShowPage,
  onChange,
  onSave,
  onMarkReviewed,
  onUnmarkReviewed,
  onRemove,
}: {
  title: string
  pageNumber: number
  record: ReviewRecord
  fields: ExtractionField[]
  draft: Record<string, string>
  issues: FieldIssue[]
  state: ReviewState
  dirty: boolean
  busy: boolean
  error?: string
  onShowPage: () => void
  onChange: (key: string, value: string) => void
  onSave: () => void
  onMarkReviewed: () => void
  onUnmarkReviewed: () => void
  onRemove: () => void
}) {
  const issueByField = new Map(issues.map((i) => [i.fieldKey, i]))
  const hasBlocking = issues.some((i) => i.severity === 'blocking')
  const badge = STATE_BADGE[state]

  const fieldState = (field: ExtractionField): FieldState => {
    const saved = record.values[field.key]
    const edited = field.key in draft && draft[field.key] !== (saved?.value ?? '')
    const issue = issueByField.get(field.key)
    return {
      saved,
      value: field.key in draft ? draft[field.key] : (saved?.value ?? ''),
      // Marking a record reviewed confirms its warnings; blocking issues always show
      issue: record.reviewed && issue?.severity === 'warning' ? undefined : issue,
      edited,
      corrected: !edited && saved?.status === 'user_corrected',
    }
  }

  return (
    <article className="border border-line rounded-lg bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <button type="button" onClick={onShowPage} className="text-xs text-brand-blue hover:underline">
          Page {pageNumber}
        </button>
        {record.source === 'user_added' && <span className="text-xs text-ink-muted">· added by you</span>}
        <span className={`ml-auto text-xs border rounded-full px-2 py-0.5 ${badge.className}`}>{badge.label}</span>
      </header>

      <div className="px-4 py-3 space-y-2">
        {groupFields(fields).map((group) => {
          if (group.kind === 'series') {
            return (
              <SeriesGrid
                key={group.fields[0].key}
                recordId={record.id}
                fields={group.fields}
                state={fieldState}
                onChange={onChange}
              />
            )
          }

          const field = group.field
          const { saved, value, issue, edited, corrected } = fieldState(field)
          const inputId = `${record.id}-${field.key}`

          return (
            <div key={field.key} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-3">
              <label htmlFor={inputId} className="text-xs text-ink-muted pt-1.5 break-words">
                {field.label}
                {field.required && <span className="text-danger"> *</span>}
              </label>
              <div>
                <input
                  id={inputId}
                  value={value}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  placeholder={INPUT_TYPE_HINT[field.dataType]}
                  aria-invalid={issue?.severity === 'blocking'}
                  aria-describedby={issue ? `${inputId}-issue` : undefined}
                  className={`w-full text-sm rounded-md border px-2 py-1 bg-white ${borderClass(issue)}`}
                />
                {issue && (
                  <p
                    id={`${inputId}-issue`}
                    className={`text-xs mt-1 ${issue.severity === 'blocking' ? 'text-danger' : 'text-brand-strong'}`}
                  >
                    {issue.severity === 'blocking' ? '✕ ' : '⚠ '}
                    {issue.message}
                  </p>
                )}
                {edited && <p className="text-xs mt-1 text-ink-muted">● Edited, not saved yet</p>}
                {corrected && (
                  <p className="text-xs mt-1 text-ink-muted">
                    ✎ Corrected by you{' '}
                    {saved?.original != null && saved.original !== saved.value && <>— AI read “{saved.original}”</>}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {error && <p className="px-4 pb-2 text-sm text-danger">{error}</p>}

      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
        <button
          type="button"
          onClick={onSave}
          disabled={busy || !dirty}
          className="text-sm border border-line rounded-md px-3 py-1.5 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        {record.reviewed ? (
          <button type="button" onClick={onUnmarkReviewed} disabled={busy} className="text-sm text-ink-muted hover:underline disabled:opacity-50">
            Undo reviewed
          </button>
        ) : (
          <button
            type="button"
            onClick={onMarkReviewed}
            disabled={busy || hasBlocking}
            title={hasBlocking ? 'Fix the items marked ✕ first' : undefined}
            className="text-sm bg-brand text-white font-medium rounded-md px-3 py-1.5 disabled:opacity-50"
          >
            {dirty ? 'Save and mark reviewed' : 'Mark reviewed'}
          </button>
        )}
        <button type="button" onClick={onRemove} disabled={busy} className="ml-auto text-xs text-danger hover:underline disabled:opacity-50">
          Remove record
        </button>
      </footer>
    </article>
  )
}
