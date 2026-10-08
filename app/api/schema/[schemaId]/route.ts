import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    const { error: deleteError } = await supabase
      .from('extraction_fields')
      .delete()
      .eq('schema_id', schemaId)
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

    if (body.fields.length > 0) {
      const { error: insertError } = await supabase.from('extraction_fields').insert(
        body.fields.map((f: any, index: number) => ({
          schema_id: schemaId,
          user_id: user.id,
          field_key: f.key,
          label: f.label,
          data_type: f.dataType,
          required: f.required,
          sort_order: index,
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

  const { error } = await supabase.from('extraction_schemas').delete().eq('id', schemaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}