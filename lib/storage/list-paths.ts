import type { SupabaseClient } from '@supabase/supabase-js'

/** The three private buckets, each laid out as <user id>/<job id>/<file>. */
export const USER_BUCKETS = ['original-workbooks', 'source-documents', 'generated-exports'] as const

/** Every object path under `prefix`, walking into sub-folders. */
export async function listAllPaths(supabase: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = []
  const pageSize = 1000

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: pageSize, offset })
    if (error) throw new Error(`${bucket}: ${error.message}`)

    for (const entry of data ?? []) {
      const path = `${prefix}/${entry.name}`
      // Folders come back without an id
      if (entry.id === null) paths.push(...(await listAllPaths(supabase, bucket, path)))
      else paths.push(path)
    }

    if (!data || data.length < pageSize) break
  }

  return paths
}

/**
 * Removes every stored file under `prefix` in all three buckets. Throws if
 * anything could not be removed, so the caller never goes on to delete the
 * database rows that still point at files.
 */
export async function removeAllUnder(supabase: SupabaseClient, prefix: string): Promise<number> {
  let removedTotal = 0
  for (const bucket of USER_BUCKETS) {
    const paths = await listAllPaths(supabase, bucket, prefix)
    if (paths.length === 0) continue

    const { data: removed, error } = await supabase.storage.from(bucket).remove(paths)
    if (error) throw new Error(`${bucket}: ${error.message}`)
    // A missing storage delete policy fails silently: no error, nothing removed
    if ((removed?.length ?? 0) < paths.length) {
      throw new Error(`${bucket}: could not remove ${paths.length - (removed?.length ?? 0)} file(s)`)
    }
    removedTotal += paths.length
  }
  return removedTotal
}
