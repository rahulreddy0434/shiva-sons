import type { SupabaseClient } from '@supabase/supabase-js'

// The user's own client, or the service-role client for the scheduled run
type Supabase = SupabaseClient

/** Most documents one run removes; a daily run catches up on the rest. */
const PURGE_BATCH = 500

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
 * Removes the originals of expired jobs and returns how many were removed.
 *
 * It runs in two places: with the signed-in user's own session when they open
 * the dashboard (row level security confines it to their data), and once a
 * day for every account through /api/cron/retention with the service-role
 * client, so accounts that never sign in again are covered too.
 */
export async function purgeExpiredDocuments(supabase: Supabase, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS).toISOString()

  const { data: documents, error: documentsError } = await supabase
    .from('uploaded_documents')
    .select('id, storage_path, extraction_jobs!inner(updated_at)')
    .lt('extraction_jobs.updated_at', cutoff)
    .is('purged_at', null)
    .limit(PURGE_BATCH)
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

export type RetentionNotice =
  | { kind: 'removed' }
  | { kind: 'due' }
  | { kind: 'soon'; on: Date }
  | null

/**
 * What a job page should say about its originals. Nothing while removal is
 * more than a week away or the job has no documents.
 */
export function retentionNotice(
  documents: { purged_at: string | null }[],
  lastChanged: string | Date,
  now: Date = new Date()
): RetentionNotice {
  if (documents.length === 0) return null
  if (documents.every((d) => d.purged_at)) return { kind: 'removed' }
  const days = daysUntilRemoval(lastChanged, now)
  if (days === 0) return { kind: 'due' }
  if (days <= 7) return { kind: 'soon', on: removalDate(lastChanged) }
  return null
}
