import { createClient } from '@/lib/supabase/server'
import { requireStep } from '@/lib/extraction/job-progress'
import { DocumentDropzone } from '@/components/upload/document-dropzone'
import { ProcessButton } from '@/components/extraction/process-button'
import { ExtractButton } from '@/components/extraction/extract-button'

export default async function DocumentsStepPage({
  params,
}: {
  params: Promise<{ jobId: string }>
}) {
  const { jobId } = await params
  await requireStep(jobId, 'documents')
  const supabase = await createClient()

  const { data: documents } = await supabase
    .from('uploaded_documents')
    .select('id, original_filename, file_type, page_count, status')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })

  const pagesByDocument = new Map<string, any[]>()
  if (documents && documents.length > 0) {
    const { data: pages } = await supabase
      .from('document_pages')
      .select('id, document_id, page_number, ocr_raw, extraction_records(id, status, extracted_fields(field_key, value, confidence, status))')
      .in('document_id', documents.map((d) => d.id))
      .order('page_number', { ascending: true })

    for (const p of pages ?? []) {
      const list = pagesByDocument.get(p.document_id) ?? []
      list.push(p)
      pagesByDocument.set(p.document_id, list)
    }
  }

  const pendingOcrIds = documents?.filter((d) => d.status === 'uploaded').map((d) => d.id) ?? []
  const pendingExtractIds = documents?.filter((d) => d.status === 'ocr_complete').map((d) => d.id) ?? []

  return (
    <div>
      <p className="text-sm text-[#5B6B78] mb-4">Step 3 of 5 — Documents</p>
      <DocumentDropzone jobId={jobId} />

      {documents && documents.length > 0 && (
        <div className="mt-5 space-y-3">
          {documents.map((doc) => (
            <div key={doc.id} className="border-b border-[#DADDD5] pb-2">
              <div className="flex items-center justify-between text-sm py-1">
                <span>📄 {doc.original_filename}</span>
                <span className="text-[#5B6B78] text-xs">
                  {doc.file_type.toUpperCase()} · {doc.page_count} page{doc.page_count === 1 ? '' : 's'} · {doc.status}
                </span>
              </div>

              {pagesByDocument.get(doc.id)?.map((p) => (
                <div key={p.id}>
                  <details className="mt-1">
                    <summary className="text-xs text-[#A97C33] cursor-pointer">
                      Page {p.page_number} — view extracted text
                    </summary>
                    <div className="mt-2 text-xs bg-[#FCFCFB] border border-[#DADDD5] rounded p-2 whitespace-pre-wrap">
                      {p.ocr_raw.text}
                    </div>
                  </details>

                  {p.extraction_records && p.extraction_records.length > 0 && (
                    <details className="mt-1">
                      <summary className="text-xs text-[#3F6B4E] cursor-pointer">
                        Page {p.page_number} — view extracted fields
                      </summary>
                      <div className="mt-2 space-y-2">
                        {p.extraction_records.map((record: any) => (
                          <div key={record.id} className="text-xs bg-[#FCFCFB] border border-[#DADDD5] rounded p-2">
                            {record.extracted_fields.map((f: any) => (
                              <div key={f.field_key} className="flex justify-between py-0.5">
                                <span className="text-[#5B6B78]">{f.field_key}</span>
                                <span>
                                  {f.value ?? <em className="text-[#9AA5A0]">missing</em>}{' '}
                                  <span className="text-[#9AA5A0]">
                                    ({Math.round((f.confidence ?? 0) * 100)}% · {f.status})
                                  </span>
                                </span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          ))}

          <ProcessButton pendingDocumentIds={pendingOcrIds} />
          <ExtractButton jobId={jobId} pendingDocumentIds={pendingExtractIds} />
        </div>
      )}
    </div>
  )
}
