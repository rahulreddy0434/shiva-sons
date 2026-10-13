import { GoogleGenAI } from '@google/genai'
import { buildExtractionPrompt, buildSchemaPrompt, type ExtractionPage, type WorkbookSheetSummary } from './prompts'
import type { ExtractionField } from '@/types/extraction'
import { isMockMode } from '@/lib/mock/mode'
import { mockExtractStructuredData, mockProposeSchemaFields } from './mock'

// Created on first use so mock mode and tests need no API key
let client: GoogleGenAI | null = null
function getClient(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  return client
}

export interface ExtractedFieldResult {
  value: string | number | null
  confidence: number
  status: 'extracted' | 'missing' | 'ambiguous' | 'invalid'
}

/** One record as returned by the model — untrusted until normalizeRecord cleans it. */
export interface ExtractedRecord {
  /** Page the record starts on, as reported by the model. */
  page?: unknown
  fields?: unknown
}

/** A field as proposed by the model — untrusted until schema-builder normalizes it. */
export interface ProposedField {
  key?: unknown
  label?: unknown
  dataType?: unknown
  required?: unknown
  column?: unknown
}

// Waits before the 2nd and 3rd attempts when Gemini is overloaded. A 429 is not
// retried: on the free tier it usually means the daily quota is gone.
const RETRY_DELAYS_MS = [2000, 6000]

async function generateJson(prompt: string): Promise<unknown> {
  let response
  for (let attempt = 0; ; attempt++) {
    try {
      response = await getClient().models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      })
      break
    } catch (err) {
      const transient = (err as { status?: number } | null)?.status === 503
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
  pages,
}: {
  instructions: string
  fields: ExtractionField[]
  /** Every page of one document, so a record that continues across pages stays whole. */
  pages: ExtractionPage[]
}): Promise<ExtractedRecord[]> {
  if (isMockMode()) return mockExtractStructuredData(fields, pages)

  const parsed = (await generateJson(buildExtractionPrompt({ instructions, fields, pages }))) as {
    records?: unknown
  } | null

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
  if (isMockMode()) return mockProposeSchemaFields(sheets)

  const parsed = (await generateJson(buildSchemaPrompt({ instructions, sheets }))) as { fields?: unknown } | null

  if (!parsed || !Array.isArray(parsed.fields)) {
    throw new Error('Gemini response was missing a "fields" array')
  }

  return parsed.fields
}
