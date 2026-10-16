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
- ✅ Lint is clean

## Phase 2 — Excel template and extraction setup 🟡

- ✅ Upload and validate `.xlsx` (type, size, real zip content, has headings)
- ✅ Header row detected rather than assumed to be row 1; every worksheet listed
- ✅ Starter timecard template for customers with no workbook
- ✅ Plain-English instructions → AI-proposed fields → edit → approve
- ✅ Each field linked to an Excel column, visible and changeable in the field editor
- ✅ Target worksheet chosen at approval
- ✅ The user can correct the detected header row; field links are kept where the heading still exists
- ✅ Start a new job from a previous job's template, instructions and field list
- ⬜ A library of saved templates on the dashboard, independent of jobs (open
  question for the product owner: "Start from a previous job" already reuses a template)
- ✅ Preview of the worksheet's existing rows on Step 1, with how many rows are filled
- ✅ Template limit of 4 MB, shown on the upload area

## Phase 3 — Documents and job tracking ✅

- ✅ Multi-file upload of PDF, JPG, PNG to private storage, with per-file progress
- ✅ 20 MB limit; type decided from file content, not name
- ✅ Remove a document (and what was extracted from it); replace = remove + upload
- ✅ Per-document status, overall progress line, failure reason, retry
- ✅ Uploads go from the browser straight to storage through a one-time link, then
  the server reads the stored file back and checks it before recording it
  (`/api/documents/upload-url`, `/api/documents/register`)
- ✅ Limits shown on the upload area and checked before sending: 20 MB per file,
  100 MB per upload; the storage buckets enforce the per-file limit too
  (needs the `storage_size_limits` migration)
- ✅ Status for every page of every document (read, records, part of the card before, nothing found)

## Phase 4 — AI extraction 🟡

- ✅ Azure Document Intelligence on every page, normalized output with tables
- ✅ One AI call per document, so a card spanning pages is one record
- ✅ AI output normalized against the field list before saving; nothing invented
- ✅ Safe re-runs; cancel between documents; failure reasons; retry
- ✅ Mock mode for both services, clearly labelled on screen
- ✅ Per-user rate limits (checked against the real table)
- ✅ A total after a run of day columns is always a number field, so it is checked and written to Excel as a number
- ✅ Long PDFs are extracted 8 pages per AI call; a card cut where two parts meet is
  joined into one record when its identifying fields match, and a value the two
  halves disagree on is marked uncertain (`lib/extraction/page-batches.ts`)
- ✅ Every page of a PDF is read: when Azure returns fewer pages than the file has
  (the free tier stops after two), the rest are sent again until all are read; a
  document that still comes back short is marked failed, never "read"
- ✅ Word and table-cell positions kept from Azure (word confidence still discarded)
- ✅ If a Gemini model is out of free quota or overloaded, the next one in
  `GEMINI_MODEL` / `GEMINI_FALLBACK_MODELS` is tried
- ✅ Slow routes declare `maxDuration` (300 s) for Vercel
- ⬜ Background processing instead of one request per document (not needed while
  each request stays under the function time limit)

## Phase 5 — Validation and side-by-side review 🟡

- ✅ Document viewer beside editable records; document and page navigation
- ✅ Corrections saved with the AI's original kept; add and remove records
- ✅ Field checks: missing required, date / time / number / duration formats, uncertain values
- ✅ Record and job checks: day cells against their total, possible duplicates
  (exact copies always; otherwise the required fields, or, when none are required,
  fields named like an identifier plus any period field such as Week Ending)
- ✅ Filters, mark reviewed, compact grid for day columns
- ✅ Stacks vertically on a phone (checked at 390 px)
- ✅ Start / end / break / total checks for clock-in style cards: overnight shifts,
  implausibly long shifts, break bounds, total against the times (`lib/validation/shift-checks.ts`)
- ✅ Per-job check settings on the Review step: most hours in one day (new check
  on day cells), longest shift, longest break, rounding, tolerance for totals.
  Approval uses the same settings. Copied with "Start from a previous job"
  (needs the `job_check_policy` migration)
- ✅ Pages are shown exactly as uploaded, scanned images and handwriting included
  (PDF.js decoders shipped with the app); zoom is steady
- ✅ Source highlighting: clicking into a value outlines where it was read — the
  day's cell in the card's table, or the matching words nearest the field's
  label — and turns to that page. Says so when a value cannot be found, and for
  documents read before positions were kept
- ✅ Pages drawn by the app (PDF.js) instead of the browser's PDF viewer, with
  zoom and rotate for PDFs and images

## Phase 6 — Approval and Excel export ✅

- ✅ Approval summary, explicit confirmation, timestamp and user; blocked by open issues
- ✅ Any later change cancels the approval
- ✅ Export appends to a copy of the template, keeps formulas and unmapped cells,
  then reopens and verifies the file; private storage; download; history
- ✅ Exported workbooks opened in Excel 16: no repair prompt, numbers are numbers, the template's formula kept

## Phase 7 — Pilot readiness 🟡

- ✅ Browser end-to-end test of the whole workflow
- ✅ Automated proof that a second account cannot reach another account's pages, API
  routes, database rows or stored files
- ✅ Retention behaviour documented; third-party services listed
- ✅ Retention: original documents and their read text removed 30 days after a job's
  last change (needs the `document_retention` migration; runs when the user opens the dashboard)
- ✅ Daily retention run for every account (Vercel Cron → `/api/cron/retention`, protected by `CRON_SECRET`)
- ✅ Signing out returns to the website; sign-in pages and the app link back to it
- ✅ Account deletion from Settings (files, then the sign-in, which cascades)
- ⬜ Accuracy measured on a set of real timecards
- ✅ Deployment checklist written (`docs/DEPLOYMENT.md`)
- 🟡 Deployed to https://shiva-sons.vercel.app (2026-10-16). Still to do in the
  dashboards: Supabase sign-in URLs point at the live site, and an email sender
- ✅ Security headers: content policy, no framing, nosniff, referrer and
  permissions policies (`lib/security-headers.ts`); Next.js 16.3.8 security release
- ✅ The same file uploaded twice into a job is refused; template titles merged
  across columns are no longer taken for the heading row; the Excel file
  downloads as soon as it is generated; plain wording for sign-in and server errors
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
| 2026-10-13 | Cross-account isolation: 6 pages, 13 API routes, 14 tables read / update / delete / insert, storage download / list / upload | `npm run test:e2e` with two test accounts | Pass |
| 2026-10-13 | New job started from a previous job's setup | `npm run test:e2e` | Pass |
| 2026-10-13 | Unit tests incl. shift checks | `npm test` (116 tests) | Pass |
| 2026-10-13 | Account deletion: wrong email refused; right email removes sign-in, rows and files in all three buckets | Throwaway account, checked with the service role | Pass |
| 2026-10-13 | Header-row correction: valid row re-reads columns, empty and invalid rows refused, restore | API calls as a test account | Pass (re-linking of fields not exercised) |
| 2026-10-14 | Retention purge against the database | Test job aged 40 days, dashboard opened as its owner | Pass: file removed, read text cleared, `purged_at` set, records kept; a recent job untouched; banner says the originals were removed |
| 2026-10-14 | Cancel button during a batch | Browser, 3 documents, extraction requests intercepted (no AI calls) | Pass: "Stopping after this document…", then "Cancelled — 1 processed, 0 failed, 2 not started"; one request sent |
| 2026-10-14 | Header-row correction keeps field links | Browser form on a copied job | Pass: same row keeps 35/35 links; a wrong row unlinks all 35 with a warning; going back relinks 35/35 |
| 2026-10-14 | Rate limiting against the real `api_usage` table | Usage filled to 30 field lists, then a real request | Pass: 429 with a plain message, refused call not counted; a user cannot delete their own usage rows |
| 2026-10-14 | Real template-shaped workbook + two made-up typed cards, end to end in the browser | Live Azure + Gemini; title row, headings on row 3, an existing row with a SUM formula; one single-page card, one two-page card with a wrong written total | Pass: headings found on row 3; AI proposed 35 fields; every day value and both "S" days (as 0) correct on both cards; the two-page card came back as one record; the wrong total flagged; exported rows 5–6 below the existing row, formula kept. Found and fixed: the AI typed Total as text, which skipped the total check and wrote "221" as text |
| 2026-10-14 | Source highlighting on the two made-up cards | Browser, after re-reading them with Azure | Pass: Card No, Company, day cells (including an "S" day recorded as 0), and the Total on page 2 outlined in the right place; a corrected value falls back to where the AI read it; zoom and rotate keep the outline on the value |
| 2026-10-14 | Unit tests, typecheck, lint, production build, browser tests | `npm test` (164), `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e` (3) | Pass |
| 2026-10-14 | 10-page PDF of six made-up cards, one card split across pages 8–9 | Live Azure + Gemini in the browser | Found: Azure read only 2 of 10 pages (free tier) and the app called the document read. Fixed; after the fix all 10 pages read in 5 rounds (~24 s), extraction ran as pages 1–8 then 9–10, six records with every day and total correct, the split card joined into one complete record |
| 2026-10-14 | Page reading in rounds, page batches, joining split cards | `npm test` | Pass |
| 2026-10-14 | The product owner's handwritten demo card (2 pages, scanned sideways) through the whole app | Live Azure + Gemini (fallback model); copies deleted afterwards | ID, name, company, total and the days off on the front page right; on the back, days 28 and 29 swapped (total still 270, so no check could catch it — caught by comparing with the card). Highlighting found ID, name and days; "270" appears three times on the back, so the total was not highlighted rather than guessed |
| 2026-10-14 | Exported workbooks opened in Excel | Excel 16 through COM | Pass: opened without repair; numbers typed as numbers; SUM in Excel matches; template formula kept |
| 2026-10-14 | Direct uploads: 21 MB file refused in the browser before sending; a card sent straight to storage and registered | Browser, request log | Pass |
| 2026-10-14 | Daily retention run reaches an account nobody is signed in to; wrong or missing secret refused | Second test account, aged job | Pass |
| 2026-10-14 | Sign-out lands on the website; "Back to the website" on sign-in | Browser | Pass |
| 2026-10-14 | Sideways page opens upright, highlight still on the value | Made-up sideways card, browser | Pass — later removed at the product owner's request: pages now show as uploaded |
| 2026-10-14 | Product owner found the review page missing the scan's handwriting, and the page shaking at 150% | Reproduced: PDF.js skipped the scan's image layers ("JBig2 failed to initialize") | Fixed by shipping PDF.js's decoders; the scan renders in full with no warnings |
| 2026-10-14 | Page holds still when zooming | 210 window sizes × zoom steps with real scrollbars, counting redraws | Pass: no redraws after settling, no size changes. The original shaking could not be reproduced in an automated browser; all three likely causes were removed (scrollbar changing the width, redraw blanking the page, loading text changing the panel size) |
| 2026-10-14 | Unit tests, typecheck, lint, production build, browser tests (isolation now covers the upload-link and register routes) | `npm test` (191), `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e` (3) | Pass |
| 2026-10-14 | Saving per-job check settings | Browser after the migration: limit set to 8.5 h, then back to standard | Pass: the 9-hour day flagged, then not; an out-of-range value refused with a message |
| 2026-10-14 | Bucket size limits | Read back from `storage.buckets` | Pass: 20 MB on source-documents |
| 2026-10-16 | Live site end to end, first deploy | Browser on shiva-sons.vercel.app, 7 made-up cards (typed, computer-handwriting fonts, tilted phone photo, fax-style cursive, sideways page) + the owner's demo card | Found: every document failed at Process — the Azure and Gemini keys were missing in Vercel. After the owner added them: pass |
| 2026-10-16 | Extraction accuracy on the made-up cards | Answer key per card; live Azure + Gemini | 280 of 280 values right on 8 monthly cards, 11 of 11 on a weekly in/out card (date read as a date). Fonts are easier than real pens — real-card accuracy still **not measured** |
| 2026-10-16 | New customer on the live site | Sign-up form, then an account made confirmed by the service role, AI fields, 5 documents, review, remove a duplicate, approve, export, delete account | Sign-up and password reset refused with "email rate limit exceeded" (Supabase's built-in sender); reset links go to a Vercel login page (Supabase URL settings). Everything else: pass; deletion leaves no rows or files |
| 2026-10-16 | Break-it checks on the live site | Second account against the first's pages, 9 API routes, storage and tables; bad, empty, oversize and renamed files; script and SQL in a job name; skipped steps | Pass: nothing reached; every bad file refused with a reason. Found and fixed: missing security headers, a raw database message, a 409 instead of 404 |
| 2026-10-16 | Fixes from the live test | Unit tests; local production build against the real services | Pass: headers present, no policy violations, the demo scan draws in full under the policy, phone picker 324 px wide, merged title skipped (headings on row 3), the same card twice refused, the Excel file downloads by itself, wrong password worded plainly |
| 2026-10-16 | Unit tests, typecheck, lint, production build, browser tests | `npm test` (204), `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e` (3) | Pass |
| — | Source highlighting on handwritten or photographed cards | Only typed PDFs tried | **Not yet verified** |
| 2026-10-13 | Two-page handwritten time card against a 36-column day template | Live Azure + Gemini as a test account; test data deleted afterwards | One record, day cells added up to the card total; the handwritten name was misread without being flagged |
| 2026-10-13 | Failed extraction shows its reason and can be retried | Gemini was busy on the first attempt | Pass |
| 2026-10-13 | Approve blocked by open issues; approve; export; download; reopen the file | API calls as a test account on a synthetic job, file read back with ExcelJS | Pass: existing row kept, 2 records appended, numbers typed |
| 2026-10-13 | Edit after approval cancels it and blocks export; job status follows | API calls + dashboard | Pass |
| 2026-10-13 | Unit tests | `npm test` (64 tests) | Pass |
