# Implementation plan

Status of each phase against [PRD.md](PRD.md). Update this file when a
milestone lands. Last updated 2026-10-13.

Legend: ✅ done · 🟡 partly done · ⬜ not started

## Phase 0 — Inspect and plan ✅

- ✅ Repository audited against the master brief
- ✅ `docs/PRD.md`, `docs/ARCHITECTURE.md`, this plan, `CLAUDE.md`
- ✅ Database schema captured in `supabase/migrations/`

## Phase 1 — Foundation ✅

- ✅ Next.js app, strict TypeScript, ESLint, Vitest, Playwright
- ✅ Sign up, sign in, sign out, password reset and change (Supabase Auth)
- ✅ Protected routes, per-user row level security
- ✅ Public home page with how-it-works and features; privacy and terms drafts (marked as drafts)
- ✅ Dashboard (recent jobs), Jobs page (all jobs), Settings page
- ✅ Named job creation; job statuses recomputed from what exists
- ✅ White / orange / blue theme from shared tokens; a sans-serif font is now actually set
- ✅ `.env.example`
- ⬜ Clear the remaining `no-explicit-any` lint errors (older files)

## Phase 2 — Excel template and extraction setup 🟡

- ✅ Upload and validate `.xlsx` (type, size, real zip content, has headings)
- ✅ Header row detected rather than assumed to be row 1; every worksheet listed
- ✅ Starter timecard template for customers with no workbook
- ✅ Plain-English instructions → AI-proposed fields → edit → approve
- ✅ Each field linked to an Excel column, visible and changeable in the field editor
- ✅ Target worksheet chosen at approval
- ⬜ Let the user correct the detected header row
- ⬜ Saved, reusable templates and mappings across jobs
- ⬜ Preview of the worksheet's existing rows

## Phase 3 — Documents and job tracking ✅

- ✅ Multi-file upload of PDF, JPG, PNG to private storage, with per-file progress
- ✅ 20 MB limit; type decided from file content, not name
- ✅ Remove a document (and what was extracted from it); replace = remove + upload
- ✅ Per-document status, overall progress line, failure reason, retry
- ⬜ Direct-to-storage uploads (needed for files over ~4.5 MB on Vercel)

## Phase 4 — AI extraction 🟡

- ✅ Azure Document Intelligence on every page, normalized output with tables
- ✅ One AI call per document, so a card spanning pages is one record
- ✅ AI output normalized against the field list before saving; nothing invented
- ✅ Safe re-runs; cancel between documents; failure reasons; retry
- ✅ Mock mode for both services, clearly labelled on screen
- ✅ Per-user rate limits (needs the `api_usage` migration applied)
- ⬜ Very long PDFs holding many cards may exceed one AI call; needs batching
- ⬜ Keep word confidence and source positions from Azure
- ⬜ Background processing instead of one request per document

## Phase 5 — Validation and side-by-side review 🟡

- ✅ Document viewer beside editable records; document and page navigation
- ✅ Corrections saved with the AI's original kept; add and remove records
- ✅ Field checks: missing required, date / time / number / duration formats, uncertain values
- ✅ Record and job checks: day cells against their total, possible duplicates
- ✅ Filters, mark reviewed, compact grid for day columns
- ✅ Stacks vertically on a phone (checked at 390 px)
- ⬜ Overnight shifts, break bounds, configurable rounding (for start/end-time style cards)
- ⬜ Source highlighting on the document

## Phase 6 — Approval and Excel export ✅

- ✅ Approval summary, explicit confirmation, timestamp and user; blocked by open issues
- ✅ Any later change cancels the approval
- ✅ Export appends to a copy of the template, keeps formulas and unmapped cells,
  then reopens and verifies the file; private storage; download; history
- ⬜ A real customer workbook opened in Excel after export (formatting, formulas)

## Phase 7 — Pilot readiness 🟡

- ✅ Browser end-to-end test of the whole workflow
- ✅ Retention behaviour documented; third-party services listed
- ⬜ Decide a retention period and build automatic expiry if wanted
- ⬜ Account deletion
- ⬜ Accuracy measured on a set of real timecards
- ⬜ Vercel deployment checklist (upload size, function time limits, env vars)
- ⬜ Legal review of the privacy and terms drafts

## Phase 8 — Later

Stripe billing, team accounts, more document types, a review-assistant
panel on flagged fields, Better Auth if still wanted.

## Verification log

| Date | What | How | Result |
|------|------|-----|--------|
| 2026-10-12 | Wizard routing and lock redirects | curl as a test account | Pass |
| 2026-10-12 | LLM field proposal on a 1–31 attendance template | Live Gemini call | 8 fields instead of 36 |
| 2026-10-12 | OCR + extraction on a generated PDF | Live Azure and Gemini calls | Pass (extraction slow, Gemini overloaded) |
| 2026-10-12 | Job delete removes storage files and all rows | Service-role count before/after | Pass |
| 2026-10-12 | Field-schema normalization | `npm test` (10 tests) | Pass |
| 2026-10-12 | Naming a job creates it; opening the page no longer does | curl as a test account | Pass |
| 2026-10-12 | Review page renders viewer + records with issues | curl as a test account, seeded synthetic records | Pass |
| 2026-10-12 | Save corrections, keep AI original, correction history | API calls + database check | Pass |
| 2026-10-12 | Mark reviewed blocked by blocking issues; add / remove record | API calls | Pass |
| 2026-10-12 | Validation and LLM-output normalization | `npm test` (35 tests) | Pass |
| 2026-10-13 | Whole workflow in a real browser: sign in, name job, starter template, fields, upload, process, review side by side (desktop and 390 px), correct, reload, mark reviewed, approval blocked then allowed, export, download and reopen the file, approval cancelled by an edit, delete with confirmation | `npm run test:e2e` (Playwright, **mock mode** — proves the screens and flow, not extraction accuracy) | Pass |
| 2026-10-13 | Public home, privacy and terms open; app pages redirect to sign-in | `npm run test:e2e` | Pass |
| 2026-10-13 | Unit tests | `npm test` (97 tests) | Pass |
| — | Cancel button during a batch | Needs a manual check | **Not yet verified** |
| — | Real template + real card through to an Excel file opened in Excel | Needs Gemini quota | **Not yet verified** |
| — | Rate limiting against the real `api_usage` table | Migration not applied yet | **Not yet verified** |
| 2026-10-13 | Two-page handwritten time card against a 36-column day template | Live Azure + Gemini as a test account; test data deleted afterwards | One record, day cells added up to the card total; the handwritten name was misread without being flagged |
| 2026-10-13 | Failed extraction shows its reason and can be retried | Gemini was busy on the first attempt | Pass |
| 2026-10-13 | Approve blocked by open issues; approve; export; download; reopen the file | API calls as a test account on a synthetic job, file read back with ExcelJS | Pass: existing row kept, 2 records appended, numbers typed |
| 2026-10-13 | Edit after approval cancels it and blocks export; job status follows | API calls + dashboard | Pass |
| 2026-10-13 | Unit tests | `npm test` (64 tests) | Pass |
