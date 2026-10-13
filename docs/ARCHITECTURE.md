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
app/api/                    route handlers (uploads, schema, OCR, extraction, job delete)
components/                 client components, grouped by feature
lib/supabase/               server and browser Supabase clients
lib/excel/                  workbook parsing
lib/extraction/             field-schema building, wizard progress
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

The browser drives the batch: it calls `/api/extraction/process` (OCR) and
`/api/extraction/extract` (LLM) once per document, so no single request
handles a whole batch and progress can be shown and cancelled between
documents.

Extraction sends every page of one document (text plus the tables OCR found)
in a single LLM call, because a time card often continues on the next page
and must come back as one record. The model's answer is untrusted:
`lib/extraction/normalize-records.ts` reduces it to exactly one clean value
per schema field before anything is stored. Both steps are safe to re-run —
OCR pages are upserted and re-extraction replaces earlier AI records — and a
failure stores a plain-language reason on the document.

Customer-specific rules (for example "enter 0 for a day not worked") live in
the job's instructions text, which the user sees and edits, not in the prompt.

Known gaps, tracked in the implementation plan: a very long PDF may not fit
one LLM call, and word confidence and source positions from Azure are discarded.

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
tested, which is enough for a handful of manual tests and nothing more.

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
  they open the dashboard; accounts that never return need a scheduled job
  (see DEPLOYMENT.md).
- Extracted values, corrections, approvals, Excel templates and generated
  files are kept until the user deletes the job.
- Deleting a job removes its files from all three storage buckets and then
  its database rows (which cascade). Removing a single document deletes its
  file, its OCR pages and every record extracted from it.
- Links to view or download files are signed and short-lived (one hour for
  the review screen, ten minutes for downloads).
- Deleting an account (Settings) removes every file in the user's folders
  with their own session, then deletes the sign-in with the service-role
  client (`lib/supabase/admin.ts`), which cascades through every table. That
  is the only place the application uses the service-role key.

## Deployment notes

- Uploads pass through a route handler. Vercel limits a request body to about
  4.5 MB on its serverless functions, well under the app's 20 MB file limit;
  larger files will need direct-to-storage signed uploads before going live.
- OCR and extraction run inside one request per document. A long or busy
  call can exceed the function time limit on Vercel's lower plans.
