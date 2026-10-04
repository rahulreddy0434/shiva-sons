import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseWorkbook } from '@/lib/excel/parse-workbook'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const jobId = formData.get('jobId') as string | null

  if (!file || !jobId) {
    return NextResponse.json({ error: 'Missing file or jobId' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  let parsed
  try {
    parsed = await parseWorkbook(buffer)
  } catch {
    return NextResponse.json(
      { error: 'Could not read that file — is it a valid .xlsx workbook?' },
      { status: 400 }
    )
  }

  if (parsed.sheets.length === 0) {
    return NextResponse.json({ error: 'No sheets with data found in that workbook.' }, { status: 400 })
  }

  const storagePath = `${user.id}/${jobId}/${file.name}`
  const { error: uploadError } = await supabase.storage
    .from('original-workbooks')
    .upload(storagePath, buffer, {
      contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    })
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: workbookFile, error: fileRowError } = await supabase
    .from('workbook_files')
    .insert({
      job_id: jobId,
      user_id: user.id,
      storage_path: storagePath,
      original_filename: file.name,
      file_size: file.size,
    })
    .select()
    .single()
  if (fileRowError || !workbookFile) {
    return NextResponse.json({ error: fileRowError?.message ?? 'Could not save workbook record' }, { status: 500 })
  }

  for (const sheet of parsed.sheets) {
    const { data: sheetRow, error: sheetError } = await supabase
      .from('workbook_sheets')
      .insert({
        workbook_file_id: workbookFile.id,
        user_id: user.id,
        sheet_name: sheet.name,
        sheet_index: sheet.index,
        header_row_index: sheet.headerRowIndex,
      })
      .select()
      .single()
    if (sheetError || !sheetRow) {
      return NextResponse.json({ error: sheetError?.message ?? 'Could not save sheet record' }, { status: 500 })
    }

    if (sheet.columns.length > 0) {
      const { error: columnsError } = await supabase.from('workbook_columns').insert(
        sheet.columns.map((col) => ({
          sheet_id: sheetRow.id,
          user_id: user.id,
          column_name: col.name,
          column_index: col.index,
          inferred_type: col.inferredType,
        }))
      )
      if (columnsError) {
        return NextResponse.json({ error: columnsError.message }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ workbookFileId: workbookFile.id, sheets: parsed.sheets })
}