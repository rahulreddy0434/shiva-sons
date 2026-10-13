export type DocumentFileType = 'pdf' | 'png' | 'jpg'

/** Starting limit per file; Vercel's own request-size limit may be lower in production. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024

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
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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
