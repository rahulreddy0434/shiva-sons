import type { createClient } from '@/lib/supabase/server'
import type { FieldValue } from '@/lib/validation/validate-record'
import { readCheckPolicy, type CheckPolicy } from '@/lib/validation/check-policy'
import type { MappableField, SheetColumn } from './job-summary'

type Supabase = Awaited<ReturnType<typeof createClient>>

export interface JobSheet {
  id: string
  name: string
  /** Zero-based position of the header row. */
  headerRowIndex: number
  columns: SheetColumn[]
}

export interface JobExportData {
  fields: MappableField[]
  documents: { id: string; name: string; status: string; pageCount: number }[]
  /** In export order: by document, then page, then when the record was created. */
  records: { id: string; reviewed: boolean; values: Record<string, FieldValue> }[]
  workbook: { id: string; storagePath: string; filename: string } | null
  sheets: JobSheet[]
  /** The job's own check settings, so approval flags exactly what Review showed. */
  policy: CheckPolicy
}

/**
 * The job's check settings, or the defaults. Read on its own so that a
 * database without the check_policy column yet still works.
 */
export async function loadCheckPolicy(supabase: Supabase, jobId: string): Promise<CheckPolicy> {
  const { data, error } = await supabase.from('extraction_jobs').select('check_policy').eq('id', jobId).maybeSingle()
  return readCheckPolicy(error ? null : data?.check_policy)
}

/**
 * Everything approval and export need about a job, loaded with the signed-in
 * user's client so row level security decides what is visible.
 */
export async function loadJobExportData(supabase: Supabase, jobId: string): Promise<JobExportData> {
  const [{ data: schema }, { data: documentRows }, { data: recordRows }, { data: workbookFile }] = await Promise.all([
    supabase
      .from('extraction_schemas')
      .select('extraction_fields(field_key, label, data_type, required, sort_order, target_column_id)')
      .eq('job_id', jobId)
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('uploaded_documents')
      .select('id, original_filename, status, document_pages(id, page_number)')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true }),
    supabase
      .from('extraction_records')
      .select('id, document_page_id, reviewed_at, created_at, extracted_fields(field_key, value, confidence, status)')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true }),
    supabase
      .from('workbook_files')
      .select('id, storage_path, original_filename')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const fields: MappableField[] = (schema?.extraction_fields ?? [])
    .map((f) => ({
      key: f.field_key,
      label: f.label,
      dataType: f.data_type as MappableField['dataType'],
      required: f.required,
      sortOrder: f.sort_order,
      targetColumnId: f.target_column_id as string | null,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  // Position of every page in export order
  const pageOrder = new Map<string, number>()
  let position = 0
  for (const doc of documentRows ?? []) {
    for (const page of [...doc.document_pages].sort((a, b) => a.page_number - b.page_number)) {
      pageOrder.set(page.id, position++)
    }
  }

  const records = (recordRows ?? [])
    .map((r, index) => ({ r, index }))
    .sort(
      (a, b) =>
        (pageOrder.get(a.r.document_page_id) ?? 0) - (pageOrder.get(b.r.document_page_id) ?? 0) || a.index - b.index
    )
    .map(({ r }) => ({
      id: r.id,
      reviewed: r.reviewed_at !== null,
      values: Object.fromEntries(
        r.extracted_fields.map((f) => [f.field_key, { value: f.value, status: f.status, confidence: f.confidence }])
      ) as Record<string, FieldValue>,
    }))

  let sheets: JobSheet[] = []
  if (workbookFile) {
    const { data: sheetRows } = await supabase
      .from('workbook_sheets')
      .select('id, sheet_name, sheet_index, header_row_index, workbook_columns(id, column_name, column_index)')
      .eq('workbook_file_id', workbookFile.id)
      .order('sheet_index', { ascending: true })
    sheets = (sheetRows ?? []).map((s) => ({
      id: s.id,
      name: s.sheet_name,
      headerRowIndex: s.header_row_index ?? 0,
      columns: [...s.workbook_columns]
        .sort((a, b) => a.column_index - b.column_index)
        .map((c) => ({ id: c.id, name: c.column_name, index: c.column_index })),
    }))
  }

  return {
    fields,
    documents: (documentRows ?? []).map((d) => ({
      id: d.id,
      name: d.original_filename,
      status: d.status,
      pageCount: d.document_pages.length,
    })),
    records,
    workbook: workbookFile
      ? { id: workbookFile.id, storagePath: workbookFile.storage_path, filename: workbookFile.original_filename }
      : null,
    sheets,
    policy: await loadCheckPolicy(supabase, jobId),
  }
}

/**
 * Sets the job's status from what actually exists, so it can never claim
 * more than has happened. Called after anything that could change it.
 */
export async function refreshJobStatus(supabase: Supabase, jobId: string): Promise<void> {
  const [approval, records, documents] = await Promise.all([
    supabase.from('job_approvals').select('id').eq('job_id', jobId).is('superseded_at', null).limit(1).maybeSingle(),
    supabase.from('extraction_records').select('id', { count: 'exact', head: true }).eq('job_id', jobId),
    supabase.from('uploaded_documents').select('id', { count: 'exact', head: true }).eq('job_id', jobId),
  ])

  let status = 'draft'
  if ((documents.count ?? 0) > 0) status = 'uploaded'
  if ((records.count ?? 0) > 0) status = 'needs_review'
  if (approval.data) {
    status = 'approved'
    const { count } = await supabase
      .from('export_files')
      .select('id', { count: 'exact', head: true })
      .eq('approval_id', approval.data.id)
    if ((count ?? 0) > 0) status = 'exported'
  }

  await supabase
    .from('extraction_jobs')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', jobId)
}
