import { createClient } from '@/lib/supabase/server'
import { requireStep } from '@/lib/extraction/job-progress'
import {
  ReviewWorkspace,
  type ReviewDocument,
  type ReviewPage,
  type ReviewRecord,
} from '@/components/review/review-workspace'
import { purgedDocumentIds } from '@/lib/retention'
import { loadCheckPolicy } from '@/lib/review/load-job'
import { CheckSettings } from '@/components/review/check-settings'
import type { ExtractionField } from '@/types/extraction'

// How long the links to the original files stay valid after the page loads
const SIGNED_URL_SECONDS = 60 * 60

export default async function ReviewStepPage({
  params,
}: {
  params: Promise<{ jobId: string }>
}) {
  const { jobId } = await params
  await requireStep(jobId, 'review')
  const supabase = await createClient()

  const [{ data: schema }, { data: documentRows }, { data: recordRows }] = await Promise.all([
    supabase
      .from('extraction_schemas')
      .select('extraction_fields(field_key, label, data_type, required, sort_order)')
      .eq('job_id', jobId)
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('uploaded_documents')
      .select('id, original_filename, file_type, status, storage_path, document_pages(id, page_number, text:ocr_raw->>text, words:ocr_raw->words, tables:ocr_raw->tables)')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true }),
    supabase
      .from('extraction_records')
      .select('id, document_page_id, reviewed_at, source, extracted_fields(field_key, value, confidence, status, original_ai_value)')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true }),
  ])

  const fields: ExtractionField[] = (schema?.extraction_fields ?? [])
    .map((f) => ({
      key: f.field_key,
      label: f.label,
      dataType: f.data_type as ExtractionField['dataType'],
      required: f.required,
      sortOrder: f.sort_order,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const purged = await purgedDocumentIds(supabase, jobId)
  const policy = await loadCheckPolicy(supabase, jobId)
  const paths = (documentRows ?? []).filter((d) => !purged.has(d.id)).map((d) => d.storage_path)
  const { data: signed } = paths.length
    ? await supabase.storage.from('source-documents').createSignedUrls(paths, SIGNED_URL_SECONDS)
    : { data: [] }
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))

  const documents: ReviewDocument[] = (documentRows ?? []).map((d) => ({
    id: d.id,
    name: d.original_filename,
    fileType: d.file_type,
    status: d.status,
    url: purged.has(d.id) ? null : (urlByPath.get(d.storage_path) ?? null),
    purged: purged.has(d.id),
    pages: [...d.document_pages]
      .sort((a, b) => a.page_number - b.page_number)
      .map((p) => ({
        id: p.id,
        pageNumber: p.page_number,
        text: (p.text as string | null) ?? '',
        // Pages read before positions were kept have no words, and tables without boxes
        words: (p.words as ReviewPage['words'] | null) ?? [],
        tables: (p.tables as ReviewPage['tables'] | null) ?? [],
      })),
  }))

  const records: ReviewRecord[] = (recordRows ?? []).map((r) => ({
    id: r.id,
    pageId: r.document_page_id,
    reviewed: r.reviewed_at !== null,
    source: r.source,
    values: Object.fromEntries(
      r.extracted_fields.map((f) => [
        f.field_key,
        { value: f.value, status: f.status, confidence: f.confidence, original: f.original_ai_value },
      ])
    ),
  }))

  return (
    <div>
      <p className="text-sm text-ink-muted mb-1">Step 4 of 5 — Review</p>
      <p className="text-sm text-ink-muted mb-4">
        Check each record against the original document. Correct anything that is wrong, then mark the record reviewed.
      </p>
      <CheckSettings jobId={jobId} policy={policy} />
      <ReviewWorkspace fields={fields} documents={documents} records={records} policy={policy} />
    </div>
  )
}
