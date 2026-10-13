import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fillTemplate } from '@/lib/excel/fill-template'
import { loadJobExportData, refreshJobStatus } from '@/lib/review/load-job'
import { approvalBlockers, resolveExportColumns, summarizeRecords } from '@/lib/review/job-summary'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Generates the completed workbook from the job's current approval.
 * Refuses if there is no approval, or if the data changed since it was given.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { data: approval } = await supabase
    .from('job_approvals')
    .select('id, sheet_id, record_count')
    .eq('job_id', jobId)
    .is('superseded_at', null)
    .order('approved_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!approval) {
    return NextResponse.json({ error: 'Approve the reviewed data before generating the workbook.' }, { status: 409 })
  }

  const data = await loadJobExportData(supabase, jobId)
  const sheet = data.sheets.find((s) => s.id === approval.sheet_id)
  if (!data.workbook || !sheet) {
    return NextResponse.json(
      { error: 'The template changed after approval. Approve again to choose the worksheet.' },
      { status: 409 }
    )
  }

  // Belt and braces: the approval is superseded on every edit, but never
  // export anything the approval did not cover
  const summary = summarizeRecords(data.fields, data.records)
  const { columns } = resolveExportColumns(data.fields, sheet.columns)
  const blockers = approvalBlockers(summary, columns.length)
  if (blockers.length > 0 || summary.recordCount !== approval.record_count) {
    return NextResponse.json(
      { error: 'The data changed after it was approved. Review and approve it again before exporting.' },
      { status: 409 }
    )
  }

  try {
    const { data: templateBlob, error: downloadError } = await supabase.storage
      .from('original-workbooks')
      .download(data.workbook.storagePath)
    if (downloadError || !templateBlob) throw new Error(downloadError?.message ?? 'Template not found in storage')

    const result = await fillTemplate({
      template: Buffer.from(await templateBlob.arrayBuffer()),
      sheetName: sheet.name,
      headerRowIndex: sheet.headerRowIndex,
      columns,
      records: data.records.map((r) =>
        Object.fromEntries(columns.map((c) => [c.fieldKey, r.values[c.fieldKey]?.value ?? null]))
      ),
    })
    if (result.rowsWritten !== approval.record_count) {
      throw new Error(`Wrote ${result.rowsWritten} rows but ${approval.record_count} records were approved`)
    }

    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
    const baseName = data.workbook.filename.replace(/\.xlsx$/i, '')
    const filename = `${baseName} - completed ${stamp}.xlsx`
    const storagePath = `${user.id}/${jobId}/${stamp}-${crypto.randomUUID().slice(0, 8)}.xlsx`

    const { error: uploadError } = await supabase.storage
      .from('generated-exports')
      .upload(storagePath, result.buffer, { contentType: XLSX_TYPE, upsert: false })
    if (uploadError) throw new Error(uploadError.message)

    const { data: exportRow, error: insertError } = await supabase
      .from('export_files')
      .insert({
        job_id: jobId,
        user_id: user.id,
        storage_path: storagePath,
        filename,
        approval_id: approval.id,
        record_count: result.rowsWritten,
      })
      .select('id')
      .single()
    if (insertError || !exportRow) {
      // Don't leave a file behind that nothing points to
      await supabase.storage.from('generated-exports').remove([storagePath])
      throw new Error(insertError?.message ?? 'Could not record the export')
    }

    await refreshJobStatus(supabase, jobId)

    return NextResponse.json({
      exportId: exportRow.id,
      rowsWritten: result.rowsWritten,
      firstRow: result.firstRow,
      formulaCellsKept: result.formulaCellsKept,
    })
  } catch (err) {
    console.error(`Export failed for job ${jobId}:`, err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'The workbook could not be generated. Nothing was exported — please try again.' },
      { status: 500 }
    )
  }
}
