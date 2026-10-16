export interface StoredDocument {
  name: string
  path: string
}

/** More same-sized files than this in one job and the rest are not compared. */
export const MAX_COMPARED = 10

/**
 * The document already in the job that holds exactly the same bytes as a new
 * upload, if any. Only same-sized files are passed in, so this rarely reads
 * anything; a file that cannot be read back is treated as different.
 */
export async function findIdenticalDocument(
  upload: Buffer,
  sameSized: StoredDocument[],
  read: (path: string) => Promise<Buffer | null>
): Promise<StoredDocument | null> {
  for (const candidate of sameSized.slice(0, MAX_COMPARED)) {
    const stored = await read(candidate.path)
    if (stored && stored.equals(upload)) return candidate
  }
  return null
}
