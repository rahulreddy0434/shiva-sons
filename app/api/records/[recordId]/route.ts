import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateRecord, type FieldValue } from '@/lib/validation/validate-record'
import { refreshJobStatus } from '@/lib/review/load-job'
import type { ExtractionField } from '@/types/extraction'

const MAX_VALUE_LENGTH = 2000

interface FieldEdit {
  key: string
  value: string | null
}

/**
 * Saves a reviewer's edits to one record and/or its reviewed flag.
 * Body: { fields?: [{ key, value }], reviewed?: boolean }
 *
 * The AI's original value is never overwritten: it stays in
 * extracted_fields.original_ai_value, and every change is appended to
 * user_corrections.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ recordId: string }> }
) {
  const { recordId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { data: record } = await supabase
    .from('extraction_records')
    .select('id, job_id, reviewed_at, extracted_fields(id, field_key, value, confidence, status)')
    .eq('id', recordId)
    .maybeSingle()
  if (!record) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }

  const { data: schema } = await supabase
    .from('extraction_schemas')
    .select('extraction_fields(field_key, label, data_type, required, sort_order)')
    .eq('job_id', record.job_id)
    .eq('approved', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const schemaFields: ExtractionField[] = (schema?.extraction_fields ?? []).map((f) => ({
    key: f.field_key,
    label: f.label,
    dataType: f.data_type as ExtractionField['dataType'],
    required: f.required,
    sortOrder: f.sort_order,
  }))
  const allowedKeys = new Set(schemaFields.map((f) => f.key))

  const existing = new Map(record.extracted_fields.map((f) => [f.field_key, f]))
  const current: Record<string, FieldValue> = {}
  for (const f of record.extracted_fields) {
    current[f.field_key] = { value: f.value, status: f.status, confidence: f.confidence }
  }

  let changed = 0

  if (Array.isArray(body.fields)) {
    for (const edit of body.fields as FieldEdit[]) {
      if (!edit || typeof edit.key !== 'string' || !allowedKeys.has(edit.key)) {
        return NextResponse.json({ error: `Unknown field: ${String(edit?.key)}` }, { status: 400 })
      }
      const trimmed = typeof edit.value === 'string' ? edit.value.trim().slice(0, MAX_VALUE_LENGTH) : ''
      const newValue = trimmed === '' ? null : trimmed

      const row = existing.get(edit.key)
      const previousValue = row?.value ?? null
      if (previousValue === newValue) continue

      let fieldId = row?.id
      if (row) {
        const { error } = await supabase
          .from('extracted_fields')
          .update({ value: newValue, status: 'user_corrected' })
          .eq('id', row.id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      } else {
        // The AI returned nothing for this field, so there is no row yet
        const { data: inserted, error } = await supabase
          .from('extracted_fields')
          .insert({
            record_id: recordId,
            user_id: user.id,
            field_key: edit.key,
            value: newValue,
            status: 'user_corrected',
            original_ai_value: null,
          })
          .select('id')
          .single()
        if (error || !inserted) {
          return NextResponse.json({ error: error?.message ?? 'Could not save the value' }, { status: 500 })
        }
        fieldId = inserted.id
      }

      const { error: correctionError } = await supabase.from('user_corrections').insert({
        extracted_field_id: fieldId,
        user_id: user.id,
        previous_value: previousValue,
        new_value: newValue,
      })
      if (correctionError) return NextResponse.json({ error: correctionError.message }, { status: 500 })

      current[edit.key] = { value: newValue, status: 'user_corrected', confidence: row?.confidence ?? null }
      changed++
    }
  }

  const recordUpdate: Record<string, unknown> = {}
  if (changed > 0) {
    recordUpdate.status = 'user_corrected'
    recordUpdate.updated_at = new Date().toISOString()
  }

  if (typeof body.reviewed === 'boolean') {
    if (body.reviewed) {
      const blocking = validateRecord(schemaFields, current).filter((i) => i.severity === 'blocking')
      if (blocking.length > 0) {
        return NextResponse.json(
          { error: `Fix these before marking the record reviewed: ${blocking.map((i) => i.message).join(' ')}` },
          { status: 409 }
        )
      }
      recordUpdate.reviewed_at = new Date().toISOString()
      recordUpdate.reviewed_by = user.id
    } else {
      recordUpdate.reviewed_at = null
      recordUpdate.reviewed_by = null
    }
  }

  if (Object.keys(recordUpdate).length > 0) {
    const { error } = await supabase.from('extraction_records').update(recordUpdate).eq('id', recordId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Data changed after sign-off: the job must be approved again before export
  if (changed > 0) {
    await supabase
      .from('job_approvals')
      .update({ superseded_at: new Date().toISOString() })
      .eq('job_id', record.job_id)
      .is('superseded_at', null)
    await refreshJobStatus(supabase, record.job_id)
  }

  return NextResponse.json({ ok: true, changed })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ recordId: string }> }
) {
  const { recordId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { data: deleted, error } = await supabase
    .from('extraction_records')
    .delete()
    .eq('id', recordId)
    .select('id, job_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }

  await supabase
    .from('job_approvals')
    .update({ superseded_at: new Date().toISOString() })
    .eq('job_id', deleted[0].job_id)
    .is('superseded_at', null)
  await refreshJobStatus(supabase, deleted[0].job_id)

  return NextResponse.json({ ok: true })
}
