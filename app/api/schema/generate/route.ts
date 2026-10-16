import { NextResponse } from 'next/server'
import { serverError, GENERIC_FAILURE } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { buildFieldsFromColumns, buildFieldsFromInstructions } from '@/lib/extraction/schema-builder'
import { describeLlmError } from '@/lib/llm/errors'

// Reading a document or waiting on a busy AI model can take minutes; 300 s is
// the most Vercel's Hobby plan allows (see docs/DEPLOYMENT.md)
export const maxDuration = 300

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  // useColumns: build the fields from the template's columns, with no AI call
  const { jobId, instructions, useColumns } = await request.json()
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

  const limited = useColumns ? null : await checkRateLimit(supabase, user.id, 'schema')
  if (limited) {
    return NextResponse.json({ error: limited }, { status: 429 })
  }

  const { data: sheetRows } = await supabase
    .from('workbook_sheets')
    .select('sheet_name, sheet_index, workbook_columns(id, column_name, column_index, inferred_type)')
    .eq('workbook_file_id', workbookFile.id)
    .order('sheet_index', { ascending: true })

  // Field → template column, by header. The first sheet that has the header wins.
  const columnIdByName = new Map<string, string>()
  const columnIdByLooseName = new Map<string, string>()
  for (const s of sheetRows ?? []) {
    for (const c of s.workbook_columns) {
      if (!columnIdByName.has(c.column_name)) columnIdByName.set(c.column_name, c.id)
      const loose = c.column_name.trim().toLowerCase()
      if (!columnIdByLooseName.has(loose)) columnIdByLooseName.set(loose, c.id)
    }
  }
  // The AI's choice first; otherwise a header spelled like the field's label.
  // Either way the user sees and can change the link before approving.
  const resolveColumnId = (f: { label: string; targetColumn?: string | null }) =>
    (f.targetColumn ? columnIdByName.get(f.targetColumn) : undefined) ??
    columnIdByLooseName.get(f.label.trim().toLowerCase()) ??
    null

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
    fields = useColumns ? buildFieldsFromColumns(sheets) : await buildFieldsFromInstructions(instructions, sheets)
  } catch (err) {
    console.error('Schema generation failed:', err instanceof Error ? err.message : err)
    // Say why (busy, usage limit, …) so the user knows whether retrying will help
    return NextResponse.json({ error: describeLlmError(err) }, { status: 502 })
  }
  if (fields.length === 0) {
    return NextResponse.json(
      {
        error: useColumns
          ? 'No column headings were found in your template to build fields from.'
          : 'No fields could be worked out from those instructions — try describing what to extract in more detail.',
      },
      { status: 422 }
    )
  }

  const { error: instrError } = await supabase
    .from('extraction_instructions')
    .insert({ job_id: jobId, user_id: user.id, instructions_text: instructions })
  if (instrError) {
    return serverError(GENERIC_FAILURE, instrError)
  }

  const { data: schema, error: schemaError } = await supabase
    .from('extraction_schemas')
    .insert({ job_id: jobId, user_id: user.id, approved: false })
    .select()
    .single()
  if (schemaError || !schema) {
    return serverError('Could not create schema', schemaError)
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
      target_column_id: resolveColumnId(f),
    }))
  )
  if (fieldsError) {
    return serverError(GENERIC_FAILURE, fieldsError)
  }

  return NextResponse.json({ schemaId: schema.id })
}