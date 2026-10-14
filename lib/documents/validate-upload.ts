export type DocumentFileType = 'pdf' | 'png' | 'jpg'

/**
 * Per file. Files go from the browser straight to storage, so this is not
 * held back by the hosting platform's request-size limit; the storage bucket
 * enforces the same figure.
 */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024

/** For all the files chosen in one go. */
export const MAX_UPLOAD_TOTAL_BYTES = 100 * 1024 * 1024

const EXTENSIONS = /\.(pdf|jpe?g|png)$/i

export const DOCUMENT_CONTENT_TYPE: Record<DocumentFileType, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/**
 * Works out what a file really is from its first bytes. The name and the
 * type the browser reports are both under the uploader's control, so
 * neither is trusted.
 */
export function sniffDocumentType(bytes: Uint8Array): DocumentFileType | null {
  if (bytes.length >= 8 && PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'

  // "%PDF-" normally starts the file, but the format allows a little junk before it
  const head = Buffer.from(bytes.subarray(0, 1024)).toString('latin1')
  if (head.includes('%PDF-')) return 'pdf'

  return null
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  // "20 MB", not "20.0 MB"; "1.5 MB" keeps its decimal
  return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '')} MB`
}

/** Returns a message the user can act on, or null when the file is acceptable. */
export function checkDocument(filename: string, bytes: Uint8Array): { type: DocumentFileType } | { error: string } {
  if (bytes.length === 0) return { error: `${filename} is empty.` }
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    return { error: `${filename} is ${formatBytes(bytes.length)}; the limit is ${formatBytes(MAX_DOCUMENT_BYTES)} per file.` }
  }
  const type = sniffDocumentType(bytes)
  if (!type) return { error: `${filename} is not a PDF, JPG or PNG file.` }
  return { type }
}

/**
 * Splits the files chosen in one go into those that can be sent and those
 * that cannot, with a reason for each refusal. Files are taken in order until
 * the total limit is reached; the rest are refused rather than half-sent.
 */
export function checkSelection<T extends { name: string; size: number }>(
  files: T[]
): { accepted: T[]; rejected: { file: T; error: string }[] } {
  const accepted: T[] = []
  const rejected: { file: T; error: string }[] = []
  let total = 0
  for (const file of files) {
    if (!EXTENSIONS.test(file.name)) {
      rejected.push({ file, error: 'Not a PDF, JPG or PNG file.' })
    } else if (file.size === 0) {
      rejected.push({ file, error: 'The file is empty.' })
    } else if (file.size > MAX_DOCUMENT_BYTES) {
      rejected.push({ file, error: `${formatBytes(file.size)} — larger than the ${formatBytes(MAX_DOCUMENT_BYTES)} limit per file.` })
    } else if (total + file.size > MAX_UPLOAD_TOTAL_BYTES) {
      rejected.push({
        file,
        error: `Would take this upload past ${formatBytes(MAX_UPLOAD_TOTAL_BYTES)} in total. Upload it in a separate batch.`,
      })
    } else {
      total += file.size
      accepted.push(file)
    }
  }
  return { accepted, rejected }
}
