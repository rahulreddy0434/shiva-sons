import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { buildTable, polygonToBox, readAllPages, type NormalizedDocument } from './document-intelligence'

async function pdfWithPages(count: number): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= count; i++) pdf.addPage([200, 200]).drawText(`page ${i}`, { x: 20, y: 100, size: 12, font })
  return Buffer.from(await pdf.save())
}

/** Like Azure's free tier: reads at most `limit` pages of whatever it is sent, and notes which. */
function limitedAnalyzer(limit: number) {
  const sent: number[] = []
  const analyze = async (buffer: Buffer): Promise<NormalizedDocument> => {
    const count = (await PDFDocument.load(buffer)).getPageCount()
    sent.push(count)
    return {
      pages: Array.from({ length: Math.min(limit, count) }, (_, i) => ({
        pageNumber: i + 1, text: '', lines: [], tables: [], words: [], width: 1, height: 1,
      })),
    }
  }
  return { analyze, sent }
}

describe('readAllPages', () => {
  it('reads a long PDF in rounds when the service stops after two pages', async () => {
    const { analyze, sent } = limitedAnalyzer(2)
    const result = await readAllPages(await pdfWithPages(5), analyze)
    expect(result.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3, 4, 5])
    expect(result.expectedPages).toBe(5)
    // The whole file, then what was left each time
    expect(sent).toEqual([5, 3, 1])
  })

  it('makes one call when every page is read at once', async () => {
    const { analyze, sent } = limitedAnalyzer(100)
    const result = await readAllPages(await pdfWithPages(4), analyze)
    expect(result.pages).toHaveLength(4)
    expect(sent).toEqual([4])
  })

  it('stops and reports a short read when the service returns nothing more', async () => {
    let calls = 0
    const result = await readAllPages(await pdfWithPages(4), async () => ({
      pages: calls++ === 0 ? [{ pageNumber: 1, text: '', lines: [], tables: [], width: 1, height: 1 }] : [],
    }))
    expect(result.pages).toHaveLength(1)
    expect(result.expectedPages).toBe(4)
  })

  it('leaves an image alone', async () => {
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const result = await readAllPages(image, async () => ({
      pages: [{ pageNumber: 1, text: '', lines: [], tables: [], width: 1, height: 1 }],
    }))
    expect(result).toEqual({ pages: [{ pageNumber: 1, text: '', lines: [], tables: [], width: 1, height: 1 }] })
  })
})

describe('polygonToBox', () => {
  it('turns a four-corner polygon into a box in fractions of the page', () => {
    // A word from 1in to 2in across and 5.5in to 6in down, on a US-letter page
    expect(polygonToBox([1, 5.5, 2, 5.5, 2, 6, 1, 6], 8.5, 11)).toEqual([0.1176, 0.5, 0.1176, 0.0455])
  })

  it('handles a slightly rotated polygon by taking its outer bounds', () => {
    expect(polygonToBox([10, 12, 50, 10, 52, 30, 12, 32], 100, 100)).toEqual([0.1, 0.1, 0.42, 0.22])
  })

  it('gives null when the position or page size is missing', () => {
    expect(polygonToBox(undefined, 8.5, 11)).toBeNull()
    expect(polygonToBox([1, 2, 3], 8.5, 11)).toBeNull()
    expect(polygonToBox([1, 1, 2, 1, 2, 2, 1, 2], 0, 11)).toBeNull()
  })
})

describe('buildTable', () => {
  const region = (pageNumber: number) => ({ pageNumber, polygon: [1, 1, 2, 1, 2, 2, 1, 2] })

  it('keeps cell text and the position of cells on the table page', () => {
    const table = buildTable(
      {
        rowCount: 2,
        columnCount: 2,
        cells: [
          { rowIndex: 0, columnIndex: 0, content: 'Day', boundingRegions: [region(1)] },
          { rowIndex: 0, columnIndex: 1, content: 'Hours', boundingRegions: [region(1)] },
          { rowIndex: 1, columnIndex: 0, content: '1', boundingRegions: [region(2)] },
        ],
      },
      { pageNumber: 1, width: 10, height: 10 }
    )
    expect(table.rows).toEqual([['Day', 'Hours'], ['1', '']])
    expect(table.boxes).toEqual([
      [[0.1, 0.1, 0.1, 0.1], [0.1, 0.1, 0.1, 0.1]],
      // A cell that continues onto another page, and an empty cell, have no box here
      [null, null],
    ])
  })
})
