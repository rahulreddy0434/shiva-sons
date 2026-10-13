import type { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Retention policy: the original uploaded documents — the timecards, which
 * are the most sensitive thing the product holds — and the text read from
 * them are removed this many days after their job was last changed. The
 * extracted records and generated Excel files stay until the user deletes
 * the job.
 */
export const RETENTION_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/** When a job's original documents are due to be removed. */
export function removalDate(lastChanged: string | Date): Date {
  return new Date(new Date(lastChanged).getTime() + RETENTION_DAYS * DAY_MS)
}

export function isPastRetention(lastChanged: string | Date, now: Date = new Date()): boolean {
  return now.getTime() >= removalDate(lastChanged).getTime()
}

/** Whole days until removal, never below zero. */
export function daysUntilRemoval(lastChanged: string | Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((removalDate(lastChanged).getTime() - now.getTime()) / DAY_MS))
}

/**
 * Ids of a job's documents whose originals have been removed. Returns an
 * empty set if the retention column does not exist yet, so pages keep
 * working before the migration is applied.
 */
export async function purgedDocumentIds(supabase: Supabase, jobId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('uploaded_documents')
    .select('id')
    .eq('job_id', jobId)
    .not('purged_at', 'is', null)
  if (error) return new Set()
  return new Set((data ?? []).map((d) => d.id))
}

/**
 * Removes the originals of the signed-in user's own expired jobs. It runs
 * with that user's session, so row level security confines it to their data.
 * Returns how many documents were purged.
 *
 * This runs when the user opens the dashboard. An account that never signs
 * in again is not reached — that needs a scheduled job with elevated access,
 * which is a deployment task (see docs/DEPLOYMENT.md).
 */
export async function purgeExpiredDocuments(supabase: Supabase, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS).toISOString()

  const { data: jobs, error: jobsError } = await supabase
    .from('extraction_jobs')
    .select('id')
    .lt('updated_at', cutoff)
  if (jobsError || !jobs || jobs.length === 0) return 0

  const { data: documents, error: documentsError } = await supabase
    .from('uploaded_documents')
    .select('id, storage_path')
    .in('job_id', jobs.map((j) => j.id))
    .is('purged_at', null)
  if (documentsError) {
    // Most likely the retention migration has not been applied yet
    console.warn(`Retention purge skipped: ${documentsError.message}`)
    return 0
  }

  let purged = 0
  for (const document of documents ?? []) {
    const { error: storageError } = await supabase.storage.from('source-documents').remove([document.storage_path])
    if (storageError) {
      console.warn(`Retention: could not remove the file for document ${document.id}: ${storageError.message}`)
      continue
    }

    // The read text is the same personal data as the file
    const { error: pagesError } = await supabase
      .from('document_pages')
      .update({ ocr_raw: null })
      .eq('document_id', document.id)
    const { error: markError } = await supabase
      .from('uploaded_documents')
      .update({ purged_at: now.toISOString() })
      .eq('id', document.id)
    if (pagesError || markError) {
      console.warn(`Retention: document ${document.id} only partly purged`)
      continue
    }
    purged++
  }

  return purged
}
