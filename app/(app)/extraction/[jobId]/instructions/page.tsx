import { createClient } from '@/lib/supabase/server'
import { requireStep } from '@/lib/extraction/job-progress'
import { InstructionsForm } from '@/components/extraction/instructions-form'
import { SchemaEditor } from '@/components/extraction/schema-editor'

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
    .select('id, approved, extraction_fields(id, field_key, label, data_type, required, sort_order)')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let suggestedInstructions = ''

  if (!schema) {
    const { data: workbookFile } = await supabase
      .from('workbook_files')
      .select('id')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (workbookFile) {
      const { data: sheets } = await supabase
        .from('workbook_sheets')
        .select('workbook_columns(column_name)')
        .eq('workbook_file_id', workbookFile.id)

      const allColumnNames = (sheets ?? []).flatMap((s) => s.workbook_columns.map((c) => c.column_name))
      suggestedInstructions = allColumnNames.length > 0
        ? `Extract ${allColumnNames.join(', ')} from each document.`
        : ''
    }
  }

  return (
    <div>
      <p className="text-sm text-[#5B6B78] mb-4">Step 2 of 5 — Extraction instructions</p>

      {!schema ? (
        <InstructionsForm jobId={jobId} suggestedInstructions={suggestedInstructions} />
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
    </div>
  )
}
