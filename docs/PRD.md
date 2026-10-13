# Shiva Sons Technologies — Product requirements

Source of truth for *what* the product must do. Progress lives in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); how it is built lives in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Product

An AI-powered document-to-Excel application. The first customer is a small or
medium-sized business that receives handwritten or printed employee timecards
and types them into Excel for timekeeping or payroll preparation.

**Promise:** turn timecards into structured Excel data, review every result,
and approve before export. The application must never silently assume that an
uncertain value is correct.

Timecards come first. The architecture should allow other document types
later, but the MVP is not a general-purpose document automation platform.

## Non-negotiable requirements

1. Users create accounts, log in, and see only their own work.
2. Users upload an existing Excel workbook as the output template.
3. Users select the worksheet and map extracted fields to columns.
4. Users choose the fields to extract, or describe them in plain English.
5. Users upload multiple PDF, JPG, JPEG and PNG timecards in one job.
6. Every applicable page of every document is processed — never only the first.
7. Processing progress, errors, and per-document status are visible.
8. Extracted data is validated before it is presented as ready for approval.
9. **The original document and the editable extracted data are shown side by
   side on the main review screen. This screen must never be removed, split
   into separate pages, or reduced to a download-only flow.**
10. Users edit extracted fields directly in the review screen.
11. Users navigate between documents and pages while reviewing.
12. The original source document stays available throughout review.
13. Missing, uncertain, duplicate, or inconsistent values are flagged clearly
    (with text or icons, not colour alone).
14. Corrections are saved and still there when the user comes back.
15. Users explicitly approve reviewed data before a workbook is generated.
16. The export populates the intended locations in the customer's workbook.
17. Users download the completed Excel file.
18. Job history: existing jobs can be reopened.
19. Users can delete their jobs and documents.
20. Each customer's data and documents are isolated from every other customer.

## Workflow

| # | Step | Summary |
|---|------|---------|
| 1 | Marketing site | Home, how it works, features, sign-up/login, privacy and terms drafts. No unproven accuracy, security or compliance claims. |
| 2 | Dashboard | "New extraction", recent jobs with status and date, open / resume / retry / delete. |
| 3 | Create job | User names the job; it can be resumed later. |
| 4 | Excel template | Upload `.xlsx`, validate, read sheets and headers, choose the worksheet, confirm the data-entry area and mappings. Offer a starter template. Never assume one sheet or a row-1 header. |
| 5 | Fields | Suggested timecard fields; add, remove, rename, reorder, mark required. Plain-English description → LLM proposes a schema → user confirms. |
| 6 | Documents | Multi-file upload (PDF/JPG/JPEG/PNG, target 20 MB each), content validation, remove/replace before processing. |
| 7 | Extraction | Azure Document Intelligence on every page, normalized, then LLM mapping. Per-document and per-page status. Idempotent retries. No single long request for a whole batch. |
| 8 | Validation | Deterministic checks: missing required values, invalid/ambiguous dates and times, overnight shifts, break bounds, hour totals, duplicates, failed pages. |
| 9 | Review | Side-by-side document viewer and editable grid (requirement 9). Filters: all / needs attention / reviewed. |
| 10 | Approval | Summary of documents, pages, records, corrections, open issues, target sheet. Confirmation, timestamp, user. Later edits require re-approval. |
| 11 | Export | Fill the template from approved data only, preserve styles and formulas, verify record counts, store privately, download. |

Job states: Draft, Uploaded, Processing, Needs review, Approved, Exported, Failed.

Suggested starting fields: employee name, employee ID, date, start time, end
time, break duration, total hours, overtime hours, job or project, company or
trade name.

## Brand and UX

White or light background, orange primary accent, blue secondary accent.
Plain language for non-technical business owners. Consistent loading, empty,
success, warning and error states. Desktop first for the review screen; on
mobile the document and grid stack vertically without losing functions.

## Out of scope for the MVP

Stripe billing, team accounts and permissions, other document types,
macro-enabled workbooks, pivot tables, a general "ask anything" chatbot.

## Decisions that amend the original brief

| Date | Decision |
|------|----------|
| 2026-10-12 | **Auth stays on Supabase Auth for now** (the brief names Better Auth). It works and row level security enforces isolation in the database. Revisit later if needed. |
| 2026-10-12 | **Gemini free tier is used for testing.** It allows about 20 requests per day on the current model, so it cannot serve real use. See ARCHITECTURE.md for paid options. |

## Definition of done

The MVP is done when a user can: register and log in; start a job; upload a
workbook or use a starter template; confirm the worksheet and fields; upload
multiple timecards; have every page processed; see source and data side by
side; edit and save corrections; see and resolve validation issues; approve;
generate, download and reopen the workbook; reopen the job and see what was
exported; delete the job; and be unable to reach anyone else's data — each
backed by an automated test or a documented manual check.
