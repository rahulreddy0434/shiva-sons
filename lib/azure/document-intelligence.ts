import { PDFDocument } from 'pdf-lib'
import { isMockMode } from '@/lib/mock/mode'
import { mockAnalyzeDocument } from './mock'

const API_VERSION = '2024-11-30'

/** An axis-aligned box as fractions of the page: [left, top, width, height]. */
export type Box = [number, number, number, number]

export interface NormalizedWord {
  text: string
  box: Box
}

export interface NormalizedTable {
  rowCount: number
  columnCount: number
  rows: string[][]
  /** Where each cell sits on the table's page; null when unknown or on another page. */
  boxes?: (Box | null)[][]
}

export interface NormalizedPage {
  pageNumber: number
  text: string
  lines: string[]
  tables: NormalizedTable[]
  /** Every word with its position, so the review screen can show where a value came from. */
  words?: NormalizedWord[]
  width: number
  height: number
}

export interface NormalizedDocument {
  pages: NormalizedPage[]
  /** Pages the file has, when known (PDFs). Fewer read pages means some were not read. */
  expectedPages?: number
}

// The parts of Azure's analyze result this module reads
interface AzureRegion {
  pageNumber: number
  polygon?: number[]
}

interface AzureTable {
  rowCount: number
  columnCount: number
  cells?: { rowIndex: number; columnIndex: number; content?: string; boundingRegions?: AzureRegion[] }[]
  boundingRegions?: AzureRegion[]
}

interface AzurePage {
  pageNumber: number
  lines?: { content: string }[]
  words?: { content: string; polygon?: number[] }[]
  width?: number
  height?: number
}

const round = (n: number) => Math.round(n * 10000) / 10000

/**
 * Azure gives a four-corner polygon in the page's own unit (inches for a PDF,
 * pixels for an image). It is stored as a box in fractions of the page, so it
 * can be drawn over the page at any size.
 */
export function polygonToBox(polygon: number[] | undefined, width: number, height: number): Box | null {
  if (!polygon || polygon.length < 8 || width <= 0 || height <= 0) return null
  const xs = polygon.filter((_, i) => i % 2 === 0)
  const ys = polygon.filter((_, i) => i % 2 === 1)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return [round(left / width), round(top / height), round((Math.max(...xs) - left) / width), round((Math.max(...ys) - top) / height)]
}

export function buildTable(table: AzureTable, page?: { pageNumber: number; width: number; height: number }): NormalizedTable {
  const rows: string[][] = Array.from({ length: table.rowCount }, () => Array(table.columnCount).fill(''))
  const boxes: (Box | null)[][] = Array.from({ length: table.rowCount }, () => Array(table.columnCount).fill(null))
  for (const cell of table.cells ?? []) {
    rows[cell.rowIndex][cell.columnIndex] = cell.content ?? ''
    const region = cell.boundingRegions?.[0]
    if (page && region?.pageNumber === page.pageNumber) {
      boxes[cell.rowIndex][cell.columnIndex] = polygonToBox(region.polygon, page.width, page.height)
    }
  }
  return { rowCount: table.rowCount, columnCount: table.columnCount, rows, boxes }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Reads a document (PDF, JPG, or PNG) with Azure's prebuilt-layout model and
 * returns our own normalized shape — the rest of the app never touches
 * Azure's raw response format directly.
 *
 * Azure may read fewer pages than a PDF has (the free tier reads only the
 * first two). The remaining pages are then sent again as a smaller PDF, until
 * every page is read or Azure stops returning any. The caller compares
 * `pages.length` with `expectedPages` and must not treat a short result as complete.
 */
export async function analyzeDocument(buffer: Buffer): Promise<NormalizedDocument> {
  if (isMockMode()) return mockAnalyzeDocument(buffer)
  return readAllPages(buffer, analyzeOnce)
}

/** Pages of a PDF, or null for an image or a PDF pdf-lib cannot open. */
async function pdfPageCount(buffer: Buffer): Promise<{ pdf: PDFDocument; count: number } | null> {
  try {
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true })
    return { pdf, count: pdf.getPageCount() }
  } catch {
    return null
  }
}

/** A new PDF holding pages `from`…the last page of the original. */
async function remainingPages(pdf: PDFDocument, from: number): Promise<Buffer> {
  const part = await PDFDocument.create()
  const indices = Array.from({ length: pdf.getPageCount() - from + 1 }, (_, i) => from - 1 + i)
  for (const page of await part.copyPages(pdf, indices)) part.addPage(page)
  return Buffer.from(await part.save())
}

export async function readAllPages(
  buffer: Buffer,
  analyze: (buffer: Buffer) => Promise<NormalizedDocument>
): Promise<NormalizedDocument> {
  const first = await analyze(buffer)
  const source = await pdfPageCount(buffer)
  if (!source || first.pages.length >= source.count) {
    return source ? { ...first, expectedPages: source.count } : first
  }

  const pages = [...first.pages]
  // Each round reads at least one more page or stops, so this always ends
  while (pages.length < source.count) {
    const from = pages.length + 1
    const next = await analyze(await remainingPages(source.pdf, from))
    if (next.pages.length === 0) break
    pages.push(...next.pages.map((page) => ({ ...page, pageNumber: page.pageNumber + from - 1 })))
  }
  return { pages, expectedPages: source.count }
}

async function analyzeOnce(buffer: Buffer): Promise<NormalizedDocument> {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT!.replace(/\/$/, '')
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY!

  const submitRes = await fetch(
    `${endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=${API_VERSION}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': key,
      },
      body: JSON.stringify({ base64Source: buffer.toString('base64') }),
    }
  )

  if (submitRes.status !== 202) {
    const errorBody = await submitRes.text()
    throw new Error(`Azure Document Intelligence rejected the document: ${errorBody}`)
  }

  const operationLocation = submitRes.headers.get('operation-location')
  if (!operationLocation) {
    throw new Error('Azure Document Intelligence did not return an operation location')
  }

  // Poll until analysis finishes — usually a few seconds for a short document
  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(1500)

    const pollRes = await fetch(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': key },
    })
    const result = await pollRes.json()

    if (result.status === 'succeeded') {
      const analyzeResult = result.analyzeResult

      const azurePages = (analyzeResult.pages ?? []) as AzurePage[]
      const sizeByPage = new Map(azurePages.map((p) => [p.pageNumber, { width: p.width ?? 0, height: p.height ?? 0 }]))

      const tablesByPage = new Map<number, NormalizedTable[]>()
      for (const table of (analyzeResult.tables ?? []) as AzureTable[]) {
        const pageNumber = table.boundingRegions?.[0]?.pageNumber ?? 1
        const size = sizeByPage.get(pageNumber) ?? { width: 0, height: 0 }
        const list = tablesByPage.get(pageNumber) ?? []
        list.push(buildTable(table, { pageNumber, ...size }))
        tablesByPage.set(pageNumber, list)
      }

      const pages: NormalizedPage[] = azurePages.map((page) => ({
        pageNumber: page.pageNumber,
        text: (page.lines ?? []).map((l) => l.content).join('\n'),
        lines: (page.lines ?? []).map((l) => l.content),
        tables: tablesByPage.get(page.pageNumber) ?? [],
        words: (page.words ?? []).flatMap((w) => {
          const box = polygonToBox(w.polygon, page.width ?? 0, page.height ?? 0)
          return box ? [{ text: w.content, box }] : []
        }),
        width: page.width ?? 0,
        height: page.height ?? 0,
      }))

      return { pages }
    }

    if (result.status === 'failed') {
      throw new Error(`Azure Document Intelligence analysis failed: ${JSON.stringify(result.error ?? result)}`)
    }
    // status is "running" or "notStarted" — keep polling
  }

  throw new Error('Azure Document Intelligence took too long to respond')
}