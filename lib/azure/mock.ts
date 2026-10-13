import { PDFDocument } from 'pdf-lib'
import { MOCK_LABEL } from '@/lib/mock/mode'
import type { NormalizedDocument } from './document-intelligence'

/**
 * Stand-in for Azure in mock mode. It reads nothing from the file except how
 * many pages it has, and says so in the text it returns.
 */
export async function mockAnalyzeDocument(buffer: Buffer): Promise<NormalizedDocument> {
  let pageCount = 1
  try {
    pageCount = (await PDFDocument.load(buffer)).getPageCount()
  } catch {
    // Not a PDF (an image): one page
  }

  return {
    pages: Array.from({ length: pageCount }, (_, i) => {
      const line = `${MOCK_LABEL} OCR — synthetic text for page ${i + 1}. Nothing was read from the uploaded file.`
      return { pageNumber: i + 1, text: line, lines: [line], tables: [], width: 8.5, height: 11 }
    }),
  }
}
