'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEFAULT_CHECK_POLICY, ROUNDING_CHOICES, type CheckPolicy } from '@/lib/validation/check-policy'

const NUMBER_SETTINGS: { key: Exclude<keyof CheckPolicy, 'roundToMinutes'>; label: string; hint: string; step: string }[] = [
  { key: 'maxHoursPerDay', label: 'Most hours in one day', hint: 'A day cell above this is flagged', step: '0.5' },
  { key: 'maxShiftHours', label: 'Longest shift (hours)', hint: 'For cards with start and end times', step: '0.5' },
  { key: 'maxBreakMinutes', label: 'Longest break (minutes)', hint: 'For cards with a break column', step: '5' },
  { key: 'toleranceHours', label: 'Allowed difference for totals (hours)', hint: 'Smaller differences are treated as rounding', step: '0.01' },
]

/**
 * The limits this job's records are checked against. Changing them only
 * changes what is flagged for review; no extracted value is touched.
 */
export function CheckSettings({ jobId, policy }: { jobId: string; policy: CheckPolicy }) {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(policy).map(([k, v]) => [k, v === null ? '' : String(v)]))
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const isDefault = (Object.keys(DEFAULT_CHECK_POLICY) as (keyof CheckPolicy)[]).every(
    (k) => policy[k] === DEFAULT_CHECK_POLICY[k]
  )

  async function save(next: Record<string, string>) {
    setSaving(true)
    setMessage(null)
    const res = await fetch(`/api/jobs/${jobId}/checks`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policy: next }),
    })
    const result = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setMessage({ ok: false, text: result.error ?? 'The settings could not be saved.' })
      return
    }
    setMessage({ ok: true, text: 'Saved. The checks below now use these settings.' })
    router.refresh()
  }

  function resetToDefaults() {
    const defaults = Object.fromEntries(
      Object.entries(DEFAULT_CHECK_POLICY).map(([k, v]) => [k, v === null ? '' : String(v)])
    )
    setValues(defaults)
    save(defaults)
  }

  return (
    <details className="mb-4 rounded-lg border border-line bg-white">
      <summary className="cursor-pointer px-4 py-2.5 text-sm text-ink">
        Checks for this job{' '}
        <span className="text-xs text-ink-muted">
          · {isDefault ? 'standard settings' : 'custom settings'} · most {policy.maxHoursPerDay} h in a day
        </span>
      </summary>
      <form
        className="border-t border-line px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault()
          save(values)
        }}
      >
        <p className="text-xs text-ink-muted">
          These decide what is flagged for you to check. They never change a value or recalculate anything.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {NUMBER_SETTINGS.map(({ key, label, hint, step }) => (
            <label key={key} className="block text-sm">
              <span className="text-ink">{label}</span>
              <input
                type="number"
                step={step}
                min={0}
                required
                value={values[key]}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                className="mt-1 w-full rounded-md border border-line px-2 py-1 text-sm"
              />
              <span className="mt-0.5 block text-xs text-ink-faint">{hint}</span>
            </label>
          ))}
          <label className="block text-sm">
            <span className="text-ink">Round shift hours to</span>
            <select
              value={values.roundToMinutes}
              onChange={(e) => setValues((v) => ({ ...v, roundToMinutes: e.target.value }))}
              className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1 text-sm"
            >
              {ROUNDING_CHOICES.map((minutes) => (
                <option key={minutes ?? 'none'} value={minutes ?? ''}>
                  {minutes === null ? 'No rounding' : `Nearest ${minutes} minutes`}
                </option>
              ))}
            </select>
            <span className="mt-0.5 block text-xs text-ink-faint">Before comparing start and end times with the total</span>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-brand-blue px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {!isDefault && (
            <button type="button" onClick={resetToDefaults} disabled={saving} className="text-sm text-ink-muted hover:underline">
              Back to standard settings
            </button>
          )}
          {message && (
            <span role="status" className={`text-sm ${message.ok ? 'text-success' : 'text-danger'}`}>
              {message.ok ? '✓ ' : '✕ '}
              {message.text}
            </span>
          )}
        </div>
      </form>
    </details>
  )
}
