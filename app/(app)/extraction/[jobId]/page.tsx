import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ExcelDropzone } from '@/components/upload/excel-dropzone'
import { InstructionsForm } from '@/components/extraction/instructions-form'
import { SchemaEditor } from '@/components/extraction/schema-editor'
import { DocumentDropzone } from '@/components/upload/document-dropzone'

export default async function ExtractionJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>
}) {
  const { jobId } = await params
  const supabase = await createClient()

  const { data: job } = await supabase
    .from('extraction_jobs')
    .select('id, name')
    .eq('id', jobId)
    .single()

  if (!job) notFound()

  const { data: workbookFile } = await supabase
    .from('workbook_files')
    .select('id, original_filename')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let sheets: { sheet_name: string; workbook_columns: { column_name: string; inferred_type: string }[] }[] = []
  let suggestedInstructions = ''
  let schema: any = null

  if (workbookFile) {
    const { data } = await supabase
      .from('workbook_sheets')
      .select('sheet_name, workbook_columns(column_name, inferred_type)')
      .eq('workbook_file_id', workbookFile.id)
    sheets = data ?? []

    const allColumnNames = sheets.flatMap((s) => s.workbook_columns.map((c) => c.column_name))
    suggestedInstructions = allColumnNames.length > 0
      ? `Extract ${allColumnNames.join(', ')} from each document.`
      : ''

    const { data: schemaData } = await supabase
      .from('extraction_schemas')
      .select('id, approved, extraction_fields(id, field_key, label, data_type, required, sort_order)')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    schema = schemaData
  }

  const { data: documents } = await supabase
    .from('uploaded_documents')
    .select('id, original_filename, file_type, page_count, status')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="text-2xl font-medium text-[#1E2B3A]">{job.name}</h1>
      <p className="text-sm text-[#5B6B78] mt-1">Step 1 of 5 — Excel template</p>
      <hr className="border-[#DADDD5] my-5" />

      {!workbookFile ? (
        <ExcelDropzone jobId={job.id} />
      ) : (
        <div>
          <p className="text-sm text-[#3F6B4E] mb-4">
            {workbookFile.original_filename} uploaded — drag a different file below to replace it.
          </p>
          <ExcelDropzone jobId={job.id} />

          <div className="mt-6 space-y-5">
            {sheets.map((sheet) => (
              <div key={sheet.sheet_name}>
                <p className="text-sm font-medium mb-2">Sheet: {sheet.sheet_name}</p>
                <div className="flex flex-wrap gap-2">
                  {sheet.workbook_columns.map((col) => (
                    <span
                      key={col.column_name}
                      className="text-xs border border-[#DADDD5] rounded px-2 py-1 bg-[#FCFCFB]"
                    >
                      {col.column_name} <span className="text-[#9AA5A0]">({col.inferred_type})</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <hr className="border-[#DADDD5] my-6" />
          <p className="text-sm text-[#5B6B78] mb-3">Step 2 of 5 — Extraction instructions</p>

          {!schema ? (
            <InstructionsForm jobId={job.id} suggestedInstructions={suggestedInstructions} />
          ) : (
            <SchemaEditor
              schemaId={schema.id}
              initialApproved={schema.approved}
              initialFields={(schema.extraction_fields ?? [])
                .sort((a: any, b: any) => a.sort_order - b.sort_order)
                .map((f: any) => ({
                  id: f.id,
                  key: f.field_key,
                  label: f.label,
                  dataType: f.data_type,
                  required: f.required,
                  sortOrder: f.sort_order,
                }))}
            />
          )}

          {schema?.approved && (
            <>
              <hr className="border-[#DADDD5] my-6" />
              <p className="text-sm text-[#5B6B78] mb-3">Step 3 of 5 — Documents</p>
              <DocumentDropzone jobId={job.id} />

              {documents && documents.length > 0 && (
                <div className="mt-5 space-y-1">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between text-sm border-b border-[#DADDD5] py-2"
                    >
                      <span>📄 {doc.original_filename}</span>
                      <span className="text-[#5B6B78] text-xs">
                        {doc.file_type.toUpperCase()} · {doc.page_count} page{doc.page_count === 1 ? '' : 's'} · {doc.status}
                      </span>
                    </div>
                  ))}
                  <p className="text-sm text-[#5B6B78] pt-2">
                    {documents.length} document{documents.length === 1 ? '' : 's'} ready to process.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}