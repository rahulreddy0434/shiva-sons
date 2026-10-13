import { createClient } from '@/lib/supabase/server'
import { requireStep } from '@/lib/extraction/job-progress'
import { ExcelDropzone } from '@/components/upload/excel-dropzone'

export default async function TemplateStepPage({
  params,
}: {
  params: Promise<{ jobId: string }>
}) {
  const { jobId } = await params
  await requireStep(jobId, 'template')
  const supabase = await createClient()

  const { data: workbookFile } = await supabase
    .from('workbook_files')
    .select('id, original_filename')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let sheets: { sheet_name: string; workbook_columns: { column_name: string; inferred_type: string }[] }[] = []

  if (workbookFile) {
    const { data } = await supabase
      .from('workbook_sheets')
      .select('sheet_name, workbook_columns(column_name, inferred_type)')
      .eq('workbook_file_id', workbookFile.id)
    sheets = data ?? []
  }

  return (
    <div>
      <p className="text-sm text-[#5B6B78] mb-4">Step 1 of 5 — Excel template</p>

      {workbookFile && (
        <p className="text-sm text-[#3F6B4E] mb-4">
          {workbookFile.original_filename} uploaded — drag a different file below to replace it.
        </p>
      )}
      <ExcelDropzone jobId={jobId} />

      {workbookFile && (
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
      )}
    </div>
  )
}
