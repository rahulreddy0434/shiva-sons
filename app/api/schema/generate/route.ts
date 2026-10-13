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

  const { data: workbookFile } = await supabase
    .from('workbook_files')
    .select('id')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!workbookFile) {
    return NextResponse.json({ error: 'Upload an Excel template first' }, { status: 400 })
  }

  const { data: sheetRows } = await supabase
    .from('workbook_sheets')
    .select('sheet_name, sheet_index, workbook_columns(column_name, column_index, inferred_type)')
    .eq('workbook_file_id', workbookFile.id)
    .order('sheet_index', { ascending: true })

  const sheets = (sheetRows ?? []).map((s) => ({
    name: s.sheet_name,
    columns: [...s.workbook_columns]
      .sort((a, b) => a.column_index - b.column_index)
      .map((c) => ({ name: c.column_name, inferredType: c.inferred_type })),
  }))

  // Ask the LLM before writing anything, so a failed call leaves no
  // half-made schema behind and the user can simply try again.
  let fields
  try {
    fields = await buildFieldsFromInstructions(instructions, sheets)
  } catch (err: any) {
    console.error('Schema generation failed:', err)
    return NextResponse.json(
      { error: 'Could not generate fields from those instructions — please try again.' },
      { status: 502 }
    )
  }
  if (fields.length === 0) {
    return NextResponse.json(
      { error: 'No fields could be worked out from those instructions — try describing what to extract in more detail.' },
      { status: 422 }
    )
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

  return NextResponse.json({ schemaId: schema.id })
}