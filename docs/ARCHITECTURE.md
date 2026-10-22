# Architecture

## Stack

| Layer | Choice |
|-------|--------|
| Web app | Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict), Tailwind CSS 4 |
| Auth | Supabase Auth (`@supabase/ssr`), session refreshed in `proxy.ts` |
| Database | Supabase Postgres, row level security on every table |
| Files | Supabase Storage, three private buckets |
| OCR | Azure AI Document Intelligence, `prebuilt-layout`, API `2024-11-30` |
| LLM | Google Gemini Flash via `@google/genai`, behind `lib/llm/provider.ts` |
| Excel | ExcelJS |
| Tests | Vitest (unit), Playwright (browser end-to-end, mock mode) |

This is a newer Next.js than most examples online describe — read
`node_modules/next/dist/docs/` before using an unfamiliar API (see AGENTS.md).

## Code layout

```
app/(auth)/                 sign-in, sign-up, reset-password
app/(app)/                  signed-in shell (sidebar layout)
  dashboard/                job list
  extraction/new/           name and create a job
  extraction/[jobId]/       wizard: layout + template, instructions,
                            documents, review, export
app/api/                    route handlers (uploads, schema, OCR, extraction, review,
                            approval, export, account, cron)
components/                 client components, grouped by feature
lib/supabase/               server and browser Supabase clients
lib/excel/                  workbook parsing, preview, filling the template
lib/extraction/             field-schema building, wizard progress, page batches, page status
lib/validation/             checks on extracted values, per-job check settings
lib/review/                 source highlighting, approval summary
lib/azure/                  Document Intelligence client → normalized pages
lib/llm/                    prompts + provider (the only place that knows about Gemini)
supabase/migrations/        database schema, in order
types/                      shared TypeScript types
```

Keep it this way: route handlers and components stay thin; logic goes in
`lib/` modules that can be unit-tested without a browser or a network call.

## Authorization

Every user-owned table has a `user_id` column and an `own rows` policy
(`auth.uid() = user_id`). Storage objects live at
`<user id>/<job id>/<file>` and each bucket's policy limits a user to their
own top-level folder. All application code uses the signed-in user's client,
so the database enforces isolation even if a route forgets a filter.

The service-role key bypasses all of this. It must never be imported into
client code. One route uses it: account deletion, after the caller has been
identified with their normal session, and only on their own user id.

Every response carries the headers in `lib/security-headers.ts` (set from
`next.config.ts`): a content policy that allows only this site, the project's
Supabase origin and WebAssembly (the PDF viewer's scan decoders), no framing
by other sites, `nosniff`, and referrer and permissions policies. A new
outside service the pages call must be added there or the browser blocks it.

Errors a route cannot word better go through `serverError` (`lib/api-error.ts`):
the user sees a plain sentence, the database's message goes to the server log.
Sign-in errors from Supabase are reworded by `lib/auth-errors.ts`.

## Data model

```
extraction_jobs ─┬─ workbook_files ── workbook_sheets ── workbook_columns
                 ├─ extraction_instructions
                 ├─ extraction_schemas ── extraction_fields ──(target_column_id)→ workbook_columns
                 ├─ uploaded_documents ── document_pages ── extraction_records ─┬─ extracted_fields ── user_corrections
                 │                                                             └─ validation_issues
                 ├─ job_approvals
                 └─ export_files ──(approval_id)→ job_approvals
```

Everything cascades from `extraction_jobs`, so deleting a job removes its
rows. Storage objects do **not** cascade; `DELETE /api/jobs/[jobId]` removes
them from all three buckets first.

- `extracted_fields.original_ai_value` keeps what the AI produced;
  `value` holds the current (possibly corrected) value; `user_corrections`
  is the edit history.
- `document_pages.ocr_raw` holds the normalized OCR page (text, lines,
  tables, page size), not Azure's raw response.

### Migrations

`supabase/migrations/` is the schema's source of truth.

- `…_remote_schema.sql` — baseline, reconstructed from the live database
  catalog because `supabase db pull` needs Docker.
- `…_mapping_validation_approval.sql` — job states, target worksheet,
  page uniqueness, review columns, validation severity, `job_approvals`.
- `…_api_usage.sql` — the usage log behind rate limiting.

Apply with `supabase db push`. Before the first push, mark the baseline as
already applied so it is not re-run:
`supabase migration repair --status applied 20261013005551`.

## Processing

Uploads go straight from the browser to Supabase Storage: `/api/documents/upload-url`
checks the job and the size and returns a one-time link to a new path in the
user's own folder; the browser sends the file there; `/api/documents/register`
reads the stored bytes back, checks the real type, size and that a PDF opens,
and that the job does not already hold the same bytes (`lib/documents/identical-file.ts`,
comparing only same-sized files), then records the document — or deletes the file. No document passes through a
Vercel function, so its ~4.5 MB request limit does not apply. Limits: 20 MB per
file, 100 MB per upload (`lib/documents/validate-upload.ts`), with the bucket
enforcing the per-file limit too. Excel templates (at most 4 MB) still go through
`/api/workbooks/upload`.

The browser drives the batch: it calls `/api/extraction/process` (OCR) and
`/api/extraction/extract` (LLM) once per document, so no single request
handles a whole batch and progress can be shown and cancelled between
documents.

OCR must read every page. Azure can return fewer pages than the PDF has (the
free tier reads only the first two of each file), so `analyzeDocument` sends
the remaining pages again as a smaller PDF until all are read; if pages are
still missing, the process route marks the document failed with the count.

Extraction sends the pages of one document (text plus the tables OCR found)
in one LLM call, because a time card often continues on the next page and
must come back as one record. A document longer than 8 pages is sent in parts
of 8 (`lib/extraction/page-batches.ts`, driven page range by page range from
the browser). When the first record of a part has the same identifying values
as the last record of the part before, it is the same card cut in two and is
merged into that record; values the halves disagree on are kept but marked
uncertain. The model's answer is untrusted:
`lib/extraction/normalize-records.ts` reduces it to exactly one clean value
per schema field before anything is stored. Both steps are safe to re-run —
OCR pages are upserted and re-extraction replaces earlier AI records — and a
failure stores a plain-language reason on the document.

Customer-specific rules (for example "enter 0 for a day not worked") live in
the job's instructions text, which the user sees and edits, not in the prompt.

OCR keeps the position of every word and table cell, stored in `ocr_raw` as
boxes in fractions of the page (`lib/azure/document-intelligence.ts`). The
review screen draws each page itself with PDF.js (its worker is copied to
`public/pdfjs/` by `scripts/copy-pdf-worker.mjs` before `dev` and
`build`) and, when the reviewer clicks into a value,
`lib/review/source-locator.ts` finds where it was read: for a day column, the
cell in that day's row of the card's table; for a single value, the matching
words, nearest the field's label if the text appears more than once. It
searches only the record's own pages and returns nothing rather than guess;
the viewer then says the value could not be found. Pages read before positions
were kept cannot be highlighted until they are read again.

The viewer shows every page exactly as it was uploaded (no automatic
turning); the reviewer can zoom and rotate. PDF.js needs its decoders for
scanned images (`public/pdfjs/wasm/` and friends, copied by
`scripts/copy-pdf-worker.mjs`) — without them the image layer of many scans,
including the handwriting, is silently left out. The viewer reserves the
scrollbar's space and draws each new size off-screen, so zooming never makes
the page resize itself in a loop or flicker.

Each job has check settings (`extraction_jobs.check_policy`, null = defaults in
`lib/validation/check-policy.ts`): most hours in one day, longest shift and
break, rounding, and the tolerance for totals. They only decide what is
flagged. The Review screen and approval pass the same settings to
`validateRecords`, so approval never disagrees with what the reviewer saw.

A field's `required` is the user's choice: `null` until they pick Required or
Optional in Step 2, and the schema route refuses approval while any field is
`null` (`lib/extraction/required-choice.ts`). Neither the template columns nor
the AI decide it; ID- and name-like fields are only suggested. Checks treat
`null` as optional.

A template with several worksheets fills one of them: `extraction_jobs.target_sheet_id`,
chosen in Step 1 (`PATCH /api/jobs/[jobId]`), defaulting to the sheet with the
most headings (`lib/excel/sheet-choice.ts`). Field generation, the suggested
description and Step 2's column choices use only that sheet.

The Documents step loads only page numbers and record counts; one page's read
text and values come from `GET /api/documents/[id]/pages/[n]` when the user
opens it, so a long document stays quick.

Possible duplicates are warnings, never removed automatically: records with
exactly the same values, or the same identifying values. Identifying means
the required fields, or, when the user marked none (the usual case with
"Use my template's columns"), fields named like an identifier (ID, Name,
Employee Number) plus any period field (Week Ending, Month, Date), so the same
person's different weeks are not flagged (`identifyingFields`).

Known gap, tracked in the implementation plan: Azure's word confidence is discarded.

## LLM provider and cost

Only `lib/llm/provider.ts` talks to a model. Swapping provider means
re-implementing its two functions (`proposeSchemaFields`,
`extractStructuredData`); prompts live in `lib/llm/prompts.ts`.

Each document costs one LLM call (roughly 3,000 tokens in and 1,500 out per
page); each job costs one more for the field proposal.

Prices per million tokens, input / output, gathered 2026-10-12. Claude prices
are Anthropic's published rates; the Gemini and OpenAI figures come from
third-party pricing trackers and should be confirmed on the vendor's own
pricing page before budgeting.

| Model | Input | Output | Approx. per page |
|-------|-------|--------|------------------|
| Gemini 3.8 Flash (current) | $0.75 | $3.75 | $0.008 |
| Gemini 3.8 Flash from 2027-01-01 | $1.50 | $7.50 | $0.016 |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | $0.001 |
| Claude Haiku 5.5 | $0.10 | $0.50 | $0.001 |
| Claude Sonnet 5.5 | $2.00 | $10.00 | $0.021 |
| OpenAI GPT-5.4 nano | $0.20 | $1.25 | $0.0025 |

The Gemini free tier allowed 20 requests per day on `gemini-3.8-flash` when
tested, which is enough for a handful of manual tests and nothing more. Each
model has its own free quota, so the provider tries `GEMINI_MODEL` and then
each of `GEMINI_FALLBACK_MODELS` (default `gemini-3.7-flash,gemini-3.5-flash`)
when a model is out of quota or stays overloaded. With a paid key, set the
fallbacks to an empty value to use one model only.

Azure Document Intelligence is billed separately per page analysed.

## Third-party data handling

Uploaded documents are sent to Azure Document Intelligence for OCR. The OCR
text of each page, the user's instructions, and workbook column names are
sent to the LLM provider. Nothing else leaves Supabase. No compliance or
certification claims are made.

## Mock mode

`MOCK_AI=true` swaps Azure (`lib/azure/mock.ts`) and the LLM (`lib/llm/mock.ts`)
for canned output: OCR text that says it is synthetic, one field per template
column, and one record per document whose values are all fake and reported
with low confidence so Review flags every one. A banner is shown on every
signed-in page. It exists for trying the workflow and for the end-to-end
tests; Supabase is still real. Never enable it in production.

## Rate limiting

`lib/rate-limit.ts` caps each user per rolling hour: 200 documents read, 200
documents extracted, 30 field lists generated. Calls are logged in
`api_usage`, which users can add to and read but not edit or delete. If that
table cannot be read the call is allowed and a warning is logged, so the
limiter cannot take the product down.

## Data retention

Current behaviour, also stated on the privacy page and in Settings
(`lib/retention.ts`):

- The original uploaded documents and the text read from them are removed 30
  days after their job was last changed. The document row stays, marked
  `purged_at`, so the job still shows what was processed and extracted
  records keep their link. The purge runs with the user's own session when
  they open the dashboard, and once a day for every account through
  `/api/cron/retention` (Vercel Cron, `vercel.json`), so accounts that never
  return are covered too.
- Extracted values, corrections, approvals, Excel templates and generated
  files are kept until the user deletes the job.
- Deleting a job removes its files from all three storage buckets and then
  its database rows (which cascade). Removing a single document deletes its
  file, its OCR pages and every record extracted from it.
- Links to view or download files are signed and short-lived (one hour for
  the review screen, ten minutes for downloads).
- Deleting an account (Settings) removes every file in the user's folders
  with their own session, then deletes the sign-in with the service-role
  client (`lib/supabase/admin.ts`), which cascades through every table.
- The service-role key is used in exactly two places: account deletion (after
  the caller is identified with their own session, and only on their own id)
  and the daily retention run (which checks `CRON_SECRET` first).

## Deployment notes

See [DEPLOYMENT.md](DEPLOYMENT.md) for the step-by-step guide.

- Documents upload straight to storage, so Vercel's ~4.5 MB request limit only
  matters for Excel templates, which are capped at 4 MB for that reason.
- Reading, extraction and field generation declare `maxDuration = 300`, the
  most Vercel's Hobby plan allows. A long PDF is extracted 8 pages per request.
