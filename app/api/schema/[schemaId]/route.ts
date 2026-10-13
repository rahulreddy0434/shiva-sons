import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** A field as sent by the editor. */
interface EditedField {
  key: string
  label: string
  dataType: string
  required: boolean
  targetColumnId?: unknown
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ schemaId: string }> }
) {
  const { schemaId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }


  // Row level security hides other users' schemas, so "not visible" means "not yours"
  const { data: ownSchema } = await supabase.from('extraction_schemas').select('id').eq('id', schemaId).maybeSingle()
  if (!ownSchema) {
    return NextResponse.json({ error: 'Field list not found' }, { status: 404 })
  }

  const body = await request.json()

  // Approving the schema
  if (typeof body.approved === 'boolean') {
    const { error } = await supabase
      .from('extraction_schemas')
      .update({ approved: body.approved })
      .eq('id', schemaId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Replacing the full field list (add/remove/rename/reorder all go through here)
  if (Array.isArray(body.fields)) {
    // The list is replaced wholesale, so carry each field's template column over by key
    const { data: previous } = await supabase
      .from('extraction_fields')
      .select('field_key, target_column_id')
      .eq('schema_id', schemaId)
    const columnByKey = new Map((previous ?? []).map((f) => [f.field_key, f.target_column_id]))

    // A column chosen in the editor must be one of this user's own template
    // columns — row level security filters out anything else
    const requestedIds = body.fields
      .map((f: { targetColumnId?: unknown }) => f.targetColumnId)
      .filter((id: unknown): id is string => typeof id === 'string')
    const { data: ownColumns } = requestedIds.length
      ? await supabase.from('workbook_columns').select('id').in('id', requestedIds)
      : { data: [] }
    const ownColumnIds = new Set((ownColumns ?? []).map((c) => c.id))
    const resolveColumn = (f: { key: string; targetColumnId?: unknown }) => {
      if (!('targetColumnId' in f)) return columnByKey.get(f.key) ?? null
      return typeof f.targetColumnId === 'string' && ownColumnIds.has(f.targetColumnId) ? f.targetColumnId : null
    }

    const { error: deleteError } = await supabase
      .from('extraction_fields')
      .delete()
      .eq('schema_id', schemaId)
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

    if (body.fields.length > 0) {
      const { error: insertError } = await supabase.from('extraction_fields').insert(
        (body.fields as EditedField[]).map((f, index) => ({
          schema_id: schemaId,
          user_id: user.id,
          field_key: f.key,
          label: f.label,
          data_type: f.dataType,
          required: f.required,
          sort_order: index,
          target_column_id: resolveColumn(f),
        }))
      )
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ schemaId: string }> }
) {
  const { schemaId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

// Row level security hides other users' schemas, so "not visible" means "not yours"
  const { data: ownSchema } = await supabase.from('extraction_schemas').select('id').eq('id', schemaId).maybeSingle()
  if (!ownSchema) {
    return NextResponse.json({ error: 'Field list not found' }, { status: 404 })
  }

  const { error } = await supabase.from('extraction_schemas').delete().eq('id', schemaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}