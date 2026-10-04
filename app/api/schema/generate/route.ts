import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildFieldsFromInstructions } from '@/lib/extraction/schema-builder'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { jobId, instructions } = await request.json()
  if (!jobId || !instructions) {
    return NextResponse.json({ error: 'Missing jobId or instructions' }, { status: 400 })
  }

  const { error: instrError } = await supabase
    .from('extraction_instructions')
    .insert({ job_id: jobId, user_id: user.id, instructions_text: instructions })
  if (instrError) {
    return NextResponse.json({ error: instrError.message }, { status: 500 })
  }

  const { data: schema, error: schemaError } = await supabase
    .from('extraction_schemas')
    .insert({ job_id: jobId, user_id: user.id, approved: false })
    .select()
    .single()
  if (schemaError || !schema) {
    return NextResponse.json({ error: schemaError?.message ?? 'Could not create schema' }, { status: 500 })
  }

  const fields = buildFieldsFromInstructions(instructions)
  if (fields.length > 0) {
    const { error: fieldsError } = await supabase.from('extraction_fields').insert(
      fields.map((f) => ({
        schema_id: schema.id,
        user_id: user.id,
        field_key: f.key,
        label: f.label,
        data_type: f.dataType,
        required: f.required,
        sort_order: f.sortOrder,
      }))
    )
    if (fieldsError) {
      return NextResponse.json({ error: fieldsError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ schemaId: schema.id })
}