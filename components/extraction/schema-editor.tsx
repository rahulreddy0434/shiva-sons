'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ExtractionField } from '@/types/extraction'

export function SchemaEditor({
  schemaId,
  initialFields,
  initialApproved,
}: {
  schemaId: string
  initialFields: ExtractionField[]
  initialApproved: boolean
}) {
  const [fields, setFields] = useState<ExtractionField[]>(initialFields)
  const [approved, setApproved] = useState(initialApproved)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  function updateField(index: number, patch: Partial<ExtractionField>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index))
  }

  function addField() {
    setFields((prev) => [
      ...prev,
      { key: `field_${prev.length + 1}`, label: 'New field', dataType: 'string', required: false, sortOrder: prev.length },
    ])
  }

  function moveField(index: number, direction: -1 | 1) {
    setFields((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  async function save(approve: boolean) {
    setSaving(true)
    await fetch(`/api/schema/${schemaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields, approved: approve }),
    })
    setSaving(false)
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

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium">Fields to extract</p>
        <button type="button" onClick={startOver} className="text-xs text-[#B5522E] underline">
          Start over with new instructions
        </button>
      </div>

      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={index} className="flex items-center gap-2 border border-[#DADDD5] rounded-md px-3 py-2 bg-[#FCFCFB]">
            <input
              value={field.label}
              onChange={(e) => updateField(index, { label: e.target.value })}
              className="flex-1 text-sm bg-transparent outline-none"
            />
            <select
              value={field.dataType}
              onChange={(e) => updateField(index, { dataType: e.target.value as ExtractionField['dataType'] })}
              className="text-xs border border-[#DADDD5] rounded px-1 py-1 bg-white"
            >
              <option value="string">text</option>
              <option value="date">date</option>
              <option value="time">time</option>
              <option value="duration">duration</option>
              <option value="number">number</option>
            </select>
            <label className="flex items-center gap-1 text-xs text-[#5B6B78]">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => updateField(index, { required: e.target.checked })}
              />
              required
            </label>
            <button type="button" onClick={() => moveField(index, -1)} className="text-[#5B6B78] text-xs">↑</button>
            <button type="button" onClick={() => moveField(index, 1)} className="text-[#5B6B78] text-xs">↓</button>
            <button type="button" onClick={() => removeField(index)} className="text-[#B5522E] text-xs">✕</button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addField}
        className="mt-3 text-xs border border-dashed border-[#DADDD5] rounded px-3 py-1.5 text-[#5B6B78]"
      >
        + Add field
      </button>

      <div className="flex items-center gap-3 mt-6">
        <button
          type="button"
          disabled={saving}
          onClick={() => save(false)}
          className="text-sm border border-[#DADDD5] rounded-md px-4 py-2 disabled:opacity-60"
        >
          Save changes
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => save(true)}
          className="text-sm bg-[#A97C33] text-white rounded-md px-4 py-2 disabled:opacity-60"
        >
          {approved ? 'Approved ✓' : 'Approve schema'}
        </button>
      </div>
    </div>
  )
}