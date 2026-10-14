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
- Repeating blocks get one field PER COLUMN. When a run of columns is one measurement repeated across a series — day-of-month columns 1–31, Mon–Sun, Week 1–Week 5 — the template needs a separate value in each cell, so propose a separate field for every column in the run, all with the same type. Name them consistently: for day-of-month columns use keys "day_1", "day_2", … and labels "1", "2", … exactly as the columns are headed. Use the instructions to decide what each cell holds (for example hours worked that day → "number").
- Do not propose fields for columns that are clearly computed in the spreadsheet rather than read from the document (row numbers, running totals) unless the user asked for them.
- "label" is a short human-readable name. "key" is a snake_case identifier derived from it (lowercase letters, digits and underscores only), unique within the list.
- "dataType" must be exactly one of: "string", "date", "time", "duration", "number". Use "time" for clock times (in/out), "duration" for lengths of time (breaks), "number" for hours worked, amounts, counts and totals (including a total column after a run of day columns), "string" for names, IDs and anything else.
- "required" is true only for fields that identify the record (such as the employee's name or ID) or that the user explicitly called mandatory.
- "column" is the exact header of the template column this field fills, copied character for character from the list above, or null if the field does not correspond to a column.
- Order the fields the way they appear in the template.

Respond with ONLY a JSON object in this exact shape, nothing else:
{
  "fields": [
    { "key": "<snake_case_key>", "label": "<label>", "dataType": "<type>", "required": <true|false>, "column": "<template column header or null>" }
  ]
}`
}

export interface ExtractionPage {
  pageNumber: number
  text: string
  /** Tables OCR found on the page, each as rows of cell text. */
  tables: string[][][]
}

export function buildExtractionPrompt({
  instructions,
  fields,
  pages,
}: {
  instructions: string
  fields: ExtractionField[]
  pages: ExtractionPage[]
}): string {
  const fieldList = fields
    .map((f) => `- "${f.key}" (${f.label}, type: ${f.dataType}${f.required ? ', required' : ''})`)
    .join('\n')

  // Grid-style forms only make sense with their row/column structure, which
  // the plain text loses — so each page carries both
  const pageSections = pages
    .map((page) => {
      const tables = page.tables.length
        ? `

Tables detected on page ${page.pageNumber} (rows top to bottom, cells left to right separated by " | "; an empty cell is blank):
${page.tables
  .map((rows, i) => `Table ${i + 1}:\n${rows.map((cells) => cells.join(' | ')).join('\n')}`)
  .join('\n\n')}`
        : ''
      return `===== Page ${page.pageNumber} =====
Text:
"""
${page.text}
"""${tables}`
    })
    .join('\n\n')

  return `You are extracting structured data from a scanned business document (${pages.length} page${pages.length === 1 ? '' : 's'}) for a document-to-Excel tool.

User's extraction instructions:
"""
${instructions}
"""

Fields to extract (use these exact keys in your JSON output):
${fieldList}

The document, as read by OCR (it may contain errors, especially for handwriting; pages may have been scanned sideways):

${pageSections}

Rules:
- Extract ONLY the fields listed above. Never extract anything else, even if it appears in the document.
- One record is one subject of the document — for a time card, one employee's card. A card often continues on a following page (for example days 1–15 on the front and 16–31 on the back, with a brought-forward total): combine those pages into ONE record. Start a new record only when the person or card number changes.
- For fields that belong to a row of a grid (such as the hours for one day), read the value from that row and the relevant column. Carried-forward, brought-forward, sub-total and total rows are not days.
- If a field's value cannot be reliably determined, set "value" to null and "status" to "missing" — never invent or guess a value. Follow the user's instructions where they say what to enter for a particular case (for example a day not worked).
- If a value is present but illegible, contradictory, or ambiguous, set "status" to "ambiguous" and make your best-effort guess as "value", or null if you have no reasonable guess.
- Normalize dates to ISO format (YYYY-MM-DD), times to 24-hour HH:MM, and numbers as plain numbers (no currency symbols or commas).
- "confidence" is your own confidence from 0 to 1 that the value is correct.
- "status" must be exactly one of: "extracted", "missing", "ambiguous", "invalid".
- "page" is the number of the page where the record starts.

Respond with ONLY a JSON object in this exact shape, nothing else:
{
  "records": [
    {
      "page": <page number>,
      "fields": {
        "<field_key>": { "value": <string|number|null>, "confidence": <0-1>, "status": "<status>" }
      }
    }
  ]
}`
}
