import type { ExtractionField } from '@/types/extraction'

export interface WorkbookSheetSummary {
  name: string
  columns: { name: string; inferredType: string }[]
}

export function buildSchemaPrompt({
  instructions,
  sheets,
}: {
  instructions: string
  sheets: WorkbookSheetSummary[]
}): string {
  const sheetList = sheets
    .map((s) => {
      const columns = s.columns.map((c) => `  - "${c.name}" (looks like: ${c.inferredType})`).join('\n')
      return `Sheet "${s.name}":\n${columns || '  (no columns found)'}`
    })
    .join('\n\n')

  return `You are designing the list of fields to extract from scanned business documents (timecards, attendance registers and similar) for a document-to-Excel tool. Each field you propose will be extracted once per record (usually one record per person per document) and later written into the user's Excel template.

The user's Excel template has these columns, in order:
${sheetList || '(no workbook columns available)'}

User's extraction instructions:
"""
${instructions}
"""

Propose the field list. Rules:
- Base the fields on what the user asked for, using the template's columns to understand what each one means and to pick names and types. If the instructions only cover some columns, only propose those. If the instructions ask for something that is not a column, still include it.
- Honour exclusions in the instructions ("do not extract…", "ignore…").
- Recognise repeating blocks. When a run of columns is really one measurement repeated across a series — day-of-month columns 1–31, Mon–Sun, Week 1–Week 5, and so on — propose ONE field for the whole block, not one field per column. Give it a label that names the series and its range, e.g. "Daily attendance (days 1–31)", and type "string".
- Do not propose fields for columns that are clearly computed in the spreadsheet rather than read from the document (row numbers, running totals) unless the user asked for them.
- "label" is a short human-readable name. "key" is a snake_case identifier derived from it (lowercase letters, digits and underscores only), unique within the list.
- "dataType" must be exactly one of: "string", "date", "time", "duration", "number". Use "time" for clock times (in/out), "duration" for lengths of time (breaks), "number" for hours worked, amounts and counts, "string" for names, IDs and anything else.
- "required" is true only for fields that identify the record (such as the employee's name or ID) or that the user explicitly called mandatory.
- Order the fields the way they appear in the template.

Respond with ONLY a JSON object in this exact shape, nothing else:
{
  "fields": [
    { "key": "<snake_case_key>", "label": "<label>", "dataType": "<type>", "required": <true|false> }
  ]
}`
}

export function buildExtractionPrompt({
  instructions,
  fields,
  pageText,
}: {
  instructions: string
  fields: ExtractionField[]
  pageText: string
}): string {
  const fieldList = fields
    .map((f) => `- "${f.key}" (${f.label}, type: ${f.dataType}${f.required ? ', required' : ''})`)
    .join('\n')

  return `You are extracting structured data from one page of a scanned business document for a document-to-Excel tool.

User's extraction instructions:
"""
${instructions}
"""

Fields to extract (use these exact keys in your JSON output):
${fieldList}

Document text (from OCR, may contain errors, especially for handwriting):
"""
${pageText}
"""

Rules:
- Extract ONLY the fields listed above. Never extract anything else, even if it appears in the text.
- If a field's value cannot be reliably determined, set "value" to null and "status" to "missing" — never invent or guess a value.
- If a value is present but illegible, contradictory, or ambiguous, set "status" to "ambiguous" and make your best-effort guess as "value", or null if you have no reasonable guess.
- Normalize dates to ISO format (YYYY-MM-DD), times to 24-hour HH:MM, and numbers as plain numbers (no currency symbols or commas).
- "confidence" is your own confidence from 0 to 1 that the value is correct.
- "status" must be exactly one of: "extracted", "missing", "ambiguous", "invalid".
- If the page appears to contain more than one person's/record's worth of data, return one object per record in the "records" array. Most pages will have exactly one record.

Respond with ONLY a JSON object in this exact shape, nothing else:
{
  "records": [
    {
      "<field_key>": { "value": <string|number|null>, "confidence": <0-1>, "status": "<status>" }
    }
  ]
}`
}