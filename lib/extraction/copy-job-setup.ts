import type { createClient } from '@/lib/supabase/server'
import { storeWorkbook } from '@/lib/excel/store-workbook'

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Gives a new job the same Excel template, instructions and field list as an
 * earlier job, so a recurring job (this month's timecards) does not have to
 * be set up again. Documents and extracted data are never copied.
 *
 * The copied field list is left unapproved: the user confirms it for the new
 * job, as with any field list. Returns false if the source job has no
 * template to copy. Row level security limits the source to the user's own jobs.
 */
export async function copyJobSetup(
  supabase: Supabase,
  { userId, sourceJobId, targetJobId }: { userId: string; sourceJobId: string; targetJobId: string }
): Promise<boolean> {
  const { data: sourceWorkbook } = await supabase
    .from('workbook_files')
    .select('id, storage_path, original_filename')
    .eq('job_id', sourceJobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!sourceWorkbook) return false

  const { data: blob, error: downloadError } = await supabase.storage
    .from('original-workbooks')
    .download(sourceWorkbook.storage_path)
  if (downloadError || !blob) throw new Error(downloadError?.message ?? 'Template file not found')

  // Stored and parsed afresh, so the new job owns its own copy of the file
  const { workbookFileId } = await storeWorkbook(supabase, {
    userId,
    jobId: targetJobId,
    filename: sourceWorkbook.original_filename,
    buffer: Buffer.from(await blob.arrayBuffer()),
  })

  const { data: instructions } = await supabase
    .from('extraction_instructions')
    .select('instructions_text')
    .eq('job_id', sourceJobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: sourceSchema } = await supabase
    .from('extraction_schemas')
    .select('id, extraction_fields(field_key, label, data_type, required, sort_order, target_column_id)')
    .eq('job_id', sourceJobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Without instructions and fields there is nothing more to copy: the user starts at Step 2
  if (!instructions || !sourceSchema || sourceSchema.extraction_fields.length === 0) return true

  // Field → column links point at the old job's columns; find the same
  // position (worksheet, column) in the new copy
  const position = (sheetIndex: number, columnIndex: number) => `${sheetIndex}:${columnIndex}`
  const columnsOf = async (workbookId: string) => {
    const { data } = await supabase
      .from('workbook_sheets')
      .select('sheet_index, workbook_columns(id, column_index)')
      .eq('workbook_file_id', workbookId)
    return (data ?? []).flatMap((s) =>
      s.workbook_columns.map((c) => ({ id: c.id as string, at: position(s.sheet_index, c.column_index) }))
    )
  }
  const oldPositionById = new Map((await columnsOf(sourceWorkbook.id)).map((c) => [c.id, c.at]))
  const newIdByPosition = new Map((await columnsOf(workbookFileId)).map((c) => [c.at, c.id]))

  const { error: instructionsError } = await supabase
    .from('extraction_instructions')
    .insert({ job_id: targetJobId, user_id: userId, instructions_text: instructions.instructions_text })
  if (instructionsError) throw new Error(instructionsError.message)

  const { data: schema, error: schemaError } = await supabase
    .from('extraction_schemas')
    .insert({ job_id: targetJobId, user_id: userId, approved: false })
    .select('id')
    .single()
  if (schemaError || !schema) throw new Error(schemaError?.message ?? 'Could not copy the field list')

  const { error: fieldsError } = await supabase.from('extraction_fields').insert(
    sourceSchema.extraction_fields.map((f) => {
      const oldPosition = f.target_column_id ? oldPositionById.get(f.target_column_id as string) : undefined
      return {
        schema_id: schema.id,
        user_id: userId,
        field_key: f.field_key,
        label: f.label,
        data_type: f.data_type,
        required: f.required,
        sort_order: f.sort_order,
        target_column_id: oldPosition ? (newIdByPosition.get(oldPosition) ?? null) : null,
      }
    })
  )
  if (fieldsError) throw new Error(fieldsError.message)

  return true
}
