import { GoogleGenAI } from '@google/genai'
import { buildExtractionPrompt, buildSchemaPrompt, type WorkbookSheetSummary } from './prompts'
import type { ExtractionField } from '@/types/extraction'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

export interface ExtractedFieldResult {
  value: string | number | null
  confidence: number
  status: 'extracted' | 'missing' | 'ambiguous' | 'invalid'
}

export interface ExtractedRecord {
  [fieldKey: string]: ExtractedFieldResult
}

/** A field as proposed by the model — untrusted until schema-builder normalizes it. */
export interface ProposedField {
  key?: unknown
  label?: unknown
  dataType?: unknown
  required?: unknown
}

// Waits before the 2nd and 3rd attempts when Gemini is overloaded or rate-limiting
const RETRY_DELAYS_MS = [2000, 6000]

async function generateJson(prompt: string): Promise<any> {
  let response
  for (let attempt = 0; ; attempt++) {
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      })
      break
    } catch (err: any) {
      const transient = err?.status === 503 || err?.status === 429
      if (!transient || attempt >= RETRY_DELAYS_MS.length) throw err
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
    }
  }

  const text = response.text
  if (!text) {
    throw new Error('Gemini returned an empty response')
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Gemini did not return valid JSON')
  }
}

export async function extractStructuredData({
  instructions,
  fields,
  pageText,
}: {
  instructions: string
  fields: ExtractionField[]
  pageText: string
}): Promise<ExtractedRecord[]> {
  const parsed = await generateJson(buildExtractionPrompt({ instructions, fields, pageText }))

  if (!parsed || !Array.isArray(parsed.records)) {
    throw new Error('Gemini response was missing a "records" array')
  }

  return parsed.records
}

export async function proposeSchemaFields({
  instructions,
  sheets,
}: {
  instructions: string
  sheets: WorkbookSheetSummary[]
}): Promise<ProposedField[]> {
  const parsed = await generateJson(buildSchemaPrompt({ instructions, sheets }))

  if (!parsed || !Array.isArray(parsed.fields)) {
    throw new Error('Gemini response was missing a "fields" array')
  }

  return parsed.fields
}
