import { createClient } from '@/lib/supabase/server'
import { requireStep } from '@/lib/extraction/job-progress'
import { ExcelDropzone } from '@/components/upload/excel-dropzone'
import { StarterTemplateButton } from '@/components/upload/starter-template-button'
import { HeaderRowForm } from '@/components/upload/header-row-form'
import { MAX_HEADER_ROW } from '@/lib/excel/parse-workbook'

export default async function TemplateStepPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>
  searchParams: Promise<{ copy?: string }>
}) {
  const { jobId } = await params
  const { copy } = await searchParams
  await requireStep(jobId, 'template')
  const supabase = await createClient()

  const { data: workbookFile } = await supabase
    .from('workbook_files')
    .select('id, original_filename')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let sheets: {
    id: string
    sheet_name: string
    sheet_index: number
    header_row_index: number | null
    workbook_columns: { column_name: string; column_index: number; inferred_type: string }[]
  }[] = []

  if (workbookFile) {
    const { data } = await supabase
      .from('workbook_sheets')
      .select('id, sheet_name, sheet_index, header_row_index, workbook_columns(column_name, column_index, inferred_type)')
      .eq('workbook_file_id', workbookFile.id)
      .order('sheet_index', { ascending: true })
    sheets = data ?? []
  }

  return (
    <div className="max-w-4xl">
      <p className="text-sm text-ink-muted mb-4">Step 1 of 5 — Excel template</p>

      {copy === 'failed' && (
        <p className="mb-4 rounded-md border border-brand bg-brand-soft px-4 py-2 text-sm text-brand-strong">
          ⚠ The job was created, but the previous job&apos;s setup could not be copied. Please set this one up below.
        </p>
      )}

      {workbookFile && (
        <p className="text-sm text-success mb-4">
          ✓ {workbookFile.original_filename} uploaded — drag a different file below to replace it.
        </p>
      )}
      <ExcelDropzone jobId={jobId} />
      <StarterTemplateButton jobId={jobId} replacing={Boolean(workbookFile)} />

      {workbookFile && (
        <div className="mt-6 space-y-5">
          <p className="text-sm text-ink-muted">
            This is what we found in your workbook. You choose which worksheet to fill at the last step.
          </p>
          {sheets.map((sheet) => {
            const columns = [...sheet.workbook_columns].sort((a, b) => a.column_index - b.column_index)
            return (
              <div key={sheet.sheet_name}>
                <p className="text-sm font-medium mb-1">Worksheet: {sheet.sheet_name}</p>
                {columns.length === 0 ? (
                  <div className="text-xs text-ink-muted">
                    No column headings found on this worksheet.{' '}
                    <HeaderRowForm sheetId={sheet.id} headerRow={(sheet.header_row_index ?? 0) + 1} maxRow={MAX_HEADER_ROW} />
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-ink-muted mb-2">
                      {columns.length} column heading{columns.length === 1 ? '' : 's'} found on row{' '}
                      {(sheet.header_row_index ?? 0) + 1}.{' '}
                      <HeaderRowForm sheetId={sheet.id} headerRow={(sheet.header_row_index ?? 0) + 1} maxRow={MAX_HEADER_ROW} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {columns.map((col) => (
                        <span
                          key={col.column_index}
                          className="text-xs border border-line rounded px-2 py-1 bg-surface"
                        >
                          {col.column_name} <span className="text-ink-faint">({col.inferred_type})</span>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
