import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MAX_HEADER_ROW, readSheetColumns } from '@/lib/excel/parse-workbook'

/**
 * Lets the user correct which row of a worksheet holds the column headings.
 * Body: { sheetId, headerRow } — headerRow is the row number as Excel shows it.
 *
 * The worksheet's columns are re-read from that row. Fields that were linked
 * to a column keep their link when a column with the same heading still exists,
 * and unlinked fields are linked to a heading spelled like their name.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const sheetId = body?.sheetId
  const headerRow = Number(body?.headerRow)
  if (typeof sheetId !== 'string' || !Number.isInteger(headerRow) || headerRow < 1 || headerRow > MAX_HEADER_ROW) {
    return NextResponse.json({ error: `Enter a row number between 1 and ${MAX_HEADER_ROW}.` }, { status: 400 })
  }

  // Row level security limits both lookups to the user's own workbooks
  const { data: sheet } = await supabase
    .from('workbook_sheets')
    .select('id, sheet_name, workbook_file_id, workbook_columns(id, column_name)')
    .eq('id', sheetId)
    .maybeSingle()
  if (!sheet) {
    return NextResponse.json({ error: 'Worksheet not found' }, { status: 404 })
  }
  const { data: file } = await supabase
    .from('workbook_files')
    .select('storage_path, job_id')
    .eq('id', sheet.workbook_file_id)
    .maybeSingle()
  if (!file) {
    return NextResponse.json({ error: 'Worksheet not found' }, { status: 404 })
  }

  const { data: blob, error: downloadError } = await supabase.storage.from('original-workbooks').download(file.storage_path)
  if (downloadError || !blob) {
    return NextResponse.json({ error: 'The workbook file could not be opened. Upload it again.' }, { status: 500 })
  }

  const columns = await readSheetColumns(Buffer.from(await blob.arrayBuffer()), sheet.sheet_name, headerRow)
  if (!columns || columns.length === 0) {
    return NextResponse.json({ error: `Row ${headerRow} of “${sheet.sheet_name}” has no headings.` }, { status: 400 })
  }

  // Which fields point at which heading, before the old columns go
  const oldNameById = new Map(sheet.workbook_columns.map((c) => [c.id as string, c.column_name as string]))
  const oldIds = [...oldNameById.keys()]
  const { data: linkedFields } = oldIds.length
    ? await supabase.from('extraction_fields').select('id, target_column_id').in('target_column_id', oldIds)
    : { data: [] }

  const { error: deleteError } = await supabase.from('workbook_columns').delete().eq('sheet_id', sheetId)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  const { data: inserted, error: insertError } = await supabase
    .from('workbook_columns')
    .insert(
      columns.map((col) => ({
        sheet_id: sheetId,
        user_id: user.id,
        column_name: col.name,
        column_index: col.index,
        inferred_type: col.inferredType,
      }))
    )
    .select('id, column_name')
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  const { error: sheetError } = await supabase
    .from('workbook_sheets')
    .update({ header_row_index: headerRow - 1 })
    .eq('id', sheetId)
  if (sheetError) return NextResponse.json({ error: sheetError.message }, { status: 500 })

  // Re-link fields to the column that now carries the same heading
  const newIdByName = new Map<string, string>()
  for (const col of inserted ?? []) if (!newIdByName.has(col.column_name)) newIdByName.set(col.column_name, col.id)
  for (const field of linkedFields ?? []) {
    const name = oldNameById.get(field.target_column_id as string)
    const newId = name ? newIdByName.get(name) : undefined
    if (!newId) continue
    await supabase.from('extraction_fields').update({ target_column_id: newId }).eq('id', field.id)
  }

  // Fields with no link (for example after choosing a wrong row and coming
  // back) are matched to a heading spelled like their name, as at creation
  const newIdByLooseName = new Map<string, string>()
  for (const col of inserted ?? []) {
    const loose = col.column_name.trim().toLowerCase()
    if (!newIdByLooseName.has(loose)) newIdByLooseName.set(loose, col.id)
  }
  const { data: schema } = await supabase
    .from('extraction_schemas')
    .select('id')
    .eq('job_id', file.job_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { data: unlinked } = schema
    ? await supabase.from('extraction_fields').select('id, label').eq('schema_id', schema.id).is('target_column_id', null)
    : { data: [] }
  let stillUnlinked = 0
  for (const field of unlinked ?? []) {
    const columnId = newIdByLooseName.get(field.label.trim().toLowerCase())
    if (!columnId) {
      stillUnlinked++
      continue
    }
    await supabase.from('extraction_fields').update({ target_column_id: columnId }).eq('id', field.id)
  }

  return NextResponse.json({ columns: columns.length, unlinkedFields: stillUnlinked })
}
