import { describe, expect, it } from 'vitest'
import { checkDocument, formatBytes, MAX_DOCUMENT_BYTES, sniffDocumentType } from './validate-upload'

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46])
const pdf = new TextEncoder().encode('%PDF-1.7\n1 0 obj')

describe('sniffDocumentType', () => {
  it('recognises PDF, PNG and JPEG by their content', () => {
    expect(sniffDocumentType(pdf)).toBe('pdf')
    expect(sniffDocumentType(png)).toBe('png')
    expect(sniffDocumentType(jpg)).toBe('jpg')
  })

  it('accepts a PDF with a few stray bytes before its header', () => {
    expect(sniffDocumentType(new TextEncoder().encode('\n\n junk %PDF-1.4'))).toBe('pdf')
  })

  it('rejects other content whatever it is called', () => {
    expect(sniffDocumentType(new TextEncoder().encode('MZ this is a program'))).toBeNull()
    expect(sniffDocumentType(new TextEncoder().encode('<html><script>'))).toBeNull()
    expect(sniffDocumentType(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]))).toBeNull() // zip / xlsx
    expect(sniffDocumentType(new Uint8Array())).toBeNull()
    expect(sniffDocumentType(Uint8Array.from([0xff, 0xd8]))).toBeNull() // truncated JPEG header
  })
})

describe('checkDocument', () => {
  it('goes by content, not by the file name', () => {
    expect(checkDocument('card.pdf', png)).toEqual({ type: 'png' })
    expect(checkDocument('invoice.pdf', new TextEncoder().encode('just text'))).toEqual({
      error: 'invoice.pdf is not a PDF, JPG or PNG file.',
    })
  })

  it('rejects empty and oversized files with a clear reason', () => {
    expect(checkDocument('a.pdf', new Uint8Array())).toEqual({ error: 'a.pdf is empty.' })

    const big = new Uint8Array(MAX_DOCUMENT_BYTES + 1)
    big.set(pdf)
    const result = checkDocument('big.pdf', big)
    expect('error' in result && result.error).toContain('the limit is 20.0 MB per file')
  })

  it('accepts a file exactly at the limit', () => {
    const atLimit = new Uint8Array(MAX_DOCUMENT_BYTES)
    atLimit.set(pdf)
    expect(checkDocument('ok.pdf', atLimit)).toEqual({ type: 'pdf' })
  })
})

describe('formatBytes', () => {
  it('uses the unit a person would expect', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(240_000)).toBe('234 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
