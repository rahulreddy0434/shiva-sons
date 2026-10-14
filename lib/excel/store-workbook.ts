import type { createClient } from '@/lib/supabase/server'
import type { ParsedWorkbook } from '@/types/workbook'
import { parseWorkbook } from './parse-workbook'
import { MAX_WORKBOOK_BYTES } from './limits'

type Supabase = Awaited<ReturnType<typeof createClient>>

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** A problem the user can fix; its message is safe to show as-is. */
export class WorkbookError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message)
  }
}

/**
 * Validates a workbook, stores it privately, and records its sheets and
 * columns for the job. Used for both an uploaded template and the starter one.
 */
export async function storeWorkbook(
  supabase: Supabase,
  { userId, jobId, filename, buffer }: { userId: string; jobId: string; filename: string; buffer: Buffer }
): Promise<{ workbookFileId: string; sheets: ParsedWorkbook['sheets'] }> {
  if (!/\.xlsx$/i.test(filename)) {
    throw new WorkbookError('Please upload an .xlsx workbook. Older .xls and macro-enabled .xlsm files are not supported.')
  }
  if (buffer.length === 0) throw new WorkbookError('That file is empty.')
  if (buffer.length > MAX_WORKBOOK_BYTES) {
    throw new WorkbookError(`That workbook is larger than ${MAX_WORKBOOK_BYTES / 1024 / 1024} MB.`)
  }
  // Every .xlsx is a zip archive, which starts with "PK"
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new WorkbookError('That file is not a valid .xlsx workbook.')
  }

  // Row level security already limits this to the user's own jobs
  const { data: job } = await supabase.from('extraction_jobs').select('id').eq('id', jobId).maybeSingle()
  if (!job) throw new WorkbookError('Job not found', 404)

  let parsed: ParsedWorkbook
  try {
    parsed = await parseWorkbook(buffer)
  } catch {
    throw new WorkbookError('Could not read that file — is it a valid .xlsx workbook?')
  }

  if (!parsed.sheets.some((sheet) => sheet.columns.length > 0)) {
    throw new WorkbookError('No column headings were found in that workbook. Add a header row and try again.')
  }

  // Keep the stored name safe for a storage path; the original is kept in the database
  const safeName = filename.replace(/[^\w.\- ]+/g, '_')
  const storagePath = `${userId}/${jobId}/${safeName}`
  const { error: uploadError } = await supabase.storage
    .from('original-workbooks')
    .upload(storagePath, buffer, { contentType: XLSX_CONTENT_TYPE, upsert: true })
  if (uploadError) throw new WorkbookError(uploadError.message, 500)

  const { data: workbookFile, error: fileRowError } = await supabase
    .from('workbook_files')
    .insert({
      job_id: jobId,
      user_id: userId,
      storage_path: storagePath,
      original_filename: filename,
      file_size: buffer.length,
    })
    .select()
    .single()
  if (fileRowError || !workbookFile) {
    throw new WorkbookError(fileRowError?.message ?? 'Could not save workbook record', 500)
  }

  for (const sheet of parsed.sheets) {
    const { data: sheetRow, error: sheetError } = await supabase
      .from('workbook_sheets')
      .insert({
        workbook_file_id: workbookFile.id,
        user_id: userId,
        sheet_name: sheet.name,
        sheet_index: sheet.index,
        header_row_index: sheet.headerRowIndex,
      })
      .select()
      .single()
    if (sheetError || !sheetRow) {
      throw new WorkbookError(sheetError?.message ?? 'Could not save sheet record', 500)
    }

    if (sheet.columns.length > 0) {
      const { error: columnsError } = await supabase.from('workbook_columns').insert(
        sheet.columns.map((col) => ({
          sheet_id: sheetRow.id,
          user_id: userId,
          column_name: col.name,
          column_index: col.index,
          inferred_type: col.inferredType,
        }))
      )
      if (columnsError) throw new WorkbookError(columnsError.message, 500)
    }
  }

  return { workbookFileId: workbookFile.id, sheets: parsed.sheets }
}
