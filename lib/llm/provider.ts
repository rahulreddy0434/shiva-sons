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

// Waits before the 2nd and 3rd attempts when a model is overloaded (503).
const RETRY_DELAYS_MS = [2000, 6000]

const DEFAULT_MODEL = 'gemini-3.8-flash'
const DEFAULT_FALLBACKS = 'gemini-3.7-flash,gemini-3.5-flash'

/**
 * The models to try, in order: GEMINI_MODEL, then GEMINI_FALLBACK_MODELS
 * (comma-separated; set it to an empty value to use only the first). On the
 * free tier each model has its own daily quota, so a fallback keeps the app
 * usable when the first one's quota is spent.
 */
export function geminiModels(env: Record<string, string | undefined> = process.env): string[] {
  const primary = env.GEMINI_MODEL?.trim() || DEFAULT_MODEL
  const fallbacks = (env.GEMINI_FALLBACK_MODELS ?? DEFAULT_FALLBACKS).split(',').map((m) => m.trim())
  return [...new Set([primary, ...fallbacks].filter(Boolean))]
}

const statusOf = (err: unknown) => (err as { status?: number } | null)?.status

/**
 * Calls each model in turn until one answers. An overloaded model (503) is
 * retried a couple of times first; a model out of quota (429) or still
 * overloaded passes to the next. Any other error stops at once, and when
 * every model fails the last error is thrown.
 */
export async function callWithFallback<T>(
  models: string[],
  call: (model: string) => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<T> {
  let lastError: unknown = new Error('Gemini: no model configured')
  for (const model of models) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await call(model)
      } catch (err) {
        lastError = err
        const status = statusOf(err)
        if (status === 503 && attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt])
          continue
        }
        if (status === 429 || status === 503) break
        throw err
      }
    }
  }
  throw lastError
}

async function generateJson(prompt: string): Promise<unknown> {
  const response = await callWithFallback(geminiModels(), (model) =>
    getClient().models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    })
  )

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
