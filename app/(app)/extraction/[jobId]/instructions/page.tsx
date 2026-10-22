import { createClient } from '@/lib/supabase/server'
import { requireStep } from '@/lib/extraction/job-progress'
import { InstructionsForm } from '@/components/extraction/instructions-form'
import { SchemaEditor } from '@/components/extraction/schema-editor'
import { buildSuggestedInstructions } from '@/lib/extraction/suggested-instructions'
import { chosenSheetId } from '@/lib/excel/sheet-choice'

export default async function InstructionsStepPage({
  params,
}: {
  params: Promise<{ jobId: string }>
}) {
  const { jobId } = await params
  await requireStep(jobId, 'instructions')
  const supabase = await createClient()

  const { data: schema } = await supabase
    .from('extraction_schemas')
    .select('id, approved, extraction_fields(id, field_key, label, data_type, required, sort_order, target_column_id)')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: workbookFile } = await supabase
    .from('workbook_files')
    .select('id')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: sheets } = workbookFile
    ? await supabase
        .from('workbook_sheets')
        .select('id, sheet_name, sheet_index, workbook_columns(id, column_name, column_index)')
        .eq('workbook_file_id', workbookFile.id)
        .order('sheet_index', { ascending: true })
    : { data: [] }

  // Only the worksheet chosen in Step 1 is filled, so only its columns are offered
  const { data: job } = await supabase.from('extraction_jobs').select('target_sheet_id').eq('id', jobId).maybeSingle()
  const targetId = chosenSheetId(
    (sheets ?? []).map((s) => ({ id: s.id, columnCount: s.workbook_columns.length })),
    job?.target_sheet_id
  )
  const orderedSheets = (sheets ?? [])
    .filter((s) => s.id === targetId)
    .map((s) => ({
      name: s.sheet_name,
      columns: [...s.workbook_columns].sort((a, b) => a.column_index - b.column_index),
    }))

  const columnOptions = orderedSheets.flatMap((s) => s.columns.map((c) => ({ id: c.id, label: c.column_name })))

  const suggestedInstructions = schema
    ? ''
    : buildSuggestedInstructions(orderedSheets.flatMap((s) => s.columns.map((c) => c.column_name)))

  return (
    <div className="max-w-4xl">
      <p className="text-sm text-ink-muted mb-4">Step 2 of 5 — Extraction instructions</p>

      {!schema ? (
        <InstructionsForm jobId={jobId} suggestedInstructions={suggestedInstructions} />
      ) : (
        <SchemaEditor
          schemaId={schema.id}
          initialApproved={schema.approved}
          columns={columnOptions}
          initialFields={(schema.extraction_fields ?? [])
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((f) => ({
              id: f.id,
              key: f.field_key,
              label: f.label,
              dataType: f.data_type,
              required: f.required,
              sortOrder: f.sort_order,
              targetColumnId: f.target_column_id,
            }))}
        />
      )}
    </div>
  )
}
