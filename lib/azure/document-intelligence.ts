const API_VERSION = '2024-11-30'

interface NormalizedTable {
  rowCount: number
  columnCount: number
  rows: string[][]
}

export interface NormalizedPage {
  pageNumber: number
  text: string
  lines: string[]
  tables: NormalizedTable[]
  width: number
  height: number
}

export interface NormalizedDocument {
  pages: NormalizedPage[]
}

function buildTable(table: any): NormalizedTable {
  const rows: string[][] = Array.from({ length: table.rowCount }, () => Array(table.columnCount).fill(''))
  for (const cell of table.cells ?? []) {
    rows[cell.rowIndex][cell.columnIndex] = cell.content ?? ''
  }
  return { rowCount: table.rowCount, columnCount: table.columnCount, rows }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Sends a document (PDF, JPG, or PNG) to Azure's prebuilt-layout model and
 * returns our own normalized shape — the rest of the app never touches
 * Azure's raw response format directly.
 */
export async function analyzeDocument(buffer: Buffer): Promise<NormalizedDocument> {
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

      const tablesByPage = new Map<number, NormalizedTable[]>()
      for (const table of analyzeResult.tables ?? []) {
        const pageNumber = table.boundingRegions?.[0]?.pageNumber ?? 1
        const list = tablesByPage.get(pageNumber) ?? []
        list.push(buildTable(table))
        tablesByPage.set(pageNumber, list)
      }

      const pages: NormalizedPage[] = (analyzeResult.pages ?? []).map((page: any) => ({
        pageNumber: page.pageNumber,
        text: (page.lines ?? []).map((l: any) => l.content).join('\n'),
        lines: (page.lines ?? []).map((l: any) => l.content),
        tables: tablesByPage.get(page.pageNumber) ?? [],
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