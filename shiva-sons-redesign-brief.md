# Shiva Sons — Redesign brief for Claude Code

Hand this whole file to Claude Code as the starting brief for continuing
this project. It covers three changes on top of the working Phases 1–6.

## Project context

Shiva Sons is an AI document-to-Excel extraction MVP (timecards first).
Stack: Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind,
Supabase (Postgres auth/DB/storage, RLS on every table), Azure AI
Document Intelligence for OCR, Google Gemini Flash (`@google/genai`) for
LLM extraction.

Working so far (Phases 1–6): auth (sign up/in/out, password reset),
dashboard listing jobs, a 3-step extraction flow — upload an Excel
template and parse its structure, write extraction instructions and get
an editable field schema, upload documents and run them through OCR then
LLM extraction. All of this currently lives in one file,
`app/(app)/extraction/[jobId]/page.tsx`, which conditionally reveals each
step's content stacked on a single scrolling page. That file has grown
large and is the first thing to restructure below.

Key tables already in Postgres: `extraction_jobs`, `workbook_files`,
`workbook_sheets`, `workbook_columns`, `extraction_instructions`,
`extraction_schemas`, `extraction_fields`, `uploaded_documents`,
`document_pages`, `extraction_records`, `extracted_fields`. Every
user-owned table has a direct `user_id` column and a matching RLS policy
— keep that pattern for anything new.

---

## Change 1 — Multi-page wizard (do this first; everything else builds on it)

Replace the single stacked page with separate routes per step, sharing a
layout that owns the step indicator and navigation:

```
app/(app)/extraction/[jobId]/
├── layout.tsx              — fetches the job, computes which steps are
│                              unlocked, renders a 5-step indicator
│                              (numbered circles + connecting lines,
│                              done/active/locked states), a Back button,
│                              a Next button, and Cancel/Delete controls
│                              (see Change 2). Wraps {children}.
├── page.tsx                — bare /extraction/[jobId]: redirect to the
│                              furthest unlocked step
├── template/page.tsx       — Step 1: just the Excel upload content
├── instructions/page.tsx   — Step 2: just the instructions/schema content
├── documents/page.tsx      — Step 3: just the document upload/OCR/
│                              extraction content
├── review/page.tsx         — Step 4: placeholder for now (Phase 8)
└── export/page.tsx         — Step 5: placeholder for now (Phase 9)
```

Unlock logic (compute once in the layout, pass down or refetch per page):
- Step 1 always unlocked.
- Step 2 unlocked once a `workbook_files` row exists for the job.
- Step 3 unlocked once `extraction_schemas.approved = true`.
- Steps 4–5 unlocked once there's at least one `extraction_records` row
  (leave them as simple placeholders until Phases 8–9 build them out).

Forward navigation (Next) should be blocked past a locked step. Backward
navigation (Back) should always be free — this is also the fix for an
earlier complaint that there was no way to revisit a completed step.

Visual style: reuse the token system already established across this
project — ink navy `#1E2B3A`, paper `#F1F3EF`, brass `#A97C33` for active
state and primary actions, moss `#3F6B4E` for done/success, clay
`#B5522E` for destructive actions, line `#DADDD5` for borders. The step
indicator should look like the one in the original HTML mockup made
early in this project (numbered circles connected by thin lines, brass
for active, moss checkmark for done, grey for locked).

---

## Change 2 — Cancel and delete

Two distinct actions, don't conflate them:

**Delete** — permanently remove a job. Available from the dashboard's job
list and from within the job's own pages (e.g., in the new layout's
header). Requires a confirmation dialog. Must:
1. Delete the job's files from all three Storage buckets
   (`original-workbooks`, `source-documents`, `generated-exports`) —
   storage objects are NOT automatically removed when you delete the
   database rows that reference them, so this needs an explicit Storage
   `remove()` call listing everything under the job's path prefix.
2. Delete the `extraction_jobs` row. Every child table already has
   `on delete cascade` back to it (directly or via a parent like
   `workbook_files`), so the row delete cascades through the rest of the
   database automatically — no need to manually delete each child table.

**Cancel** — stop an in-progress OCR or extraction batch partway through.
Both `ProcessButton` and `ExtractButton` already loop through documents
one at a time from the browser (from the earlier progress-feedback fix),
so this is simpler than it sounds: add a "Cancel" button that appears
only while `processing`/`extracting` is true, which sets a ref/flag the
loop checks before starting each next document. Whatever already
completed stays completed; nothing in progress needs to be rolled back.
No new database status is required for this — it's purely a client-side
stop.

---

## Change 3 — Where AI-agent reasoning actually belongs

Two concrete recommendations, ranked, plus one explicit non-recommendation:

**1. Do now: upgrade the Step 2 schema builder to use the LLM instead of
the current plain-text parser.** `lib/extraction/schema-builder.ts`
currently just splits the instructions text on commas/"and" — it has no
real understanding of the document. This already caused a real problem:
a monthly attendance register with day-of-month columns (1–31) produced
31 meaningless top-level fields instead of being recognized as a
repeating daily-attendance pattern tied to one employee record. Replace
`buildFieldsFromInstructions` with a call through the same
`lib/llm/provider.ts` / Gemini setup already built for Phase 6, prompting
it to reason over the actual workbook column names plus the user's
instructions and propose a sensible field list (including recognizing
when a block of columns like 1–31 represents one repeating field rather
than 31 separate ones). This is a contained, independent change — same
pattern as the existing extraction call, just applied one step earlier
in the flow.

**2. Later, once Phase 8 (Review) exists: a Review Assistant panel.**
Next to a flagged field in the review screen, let the user ask "why is
this flagged" or get a suggested correction with reasoning, grounded in
that page's OCR text. This is the most natural fit for agentic,
back-and-forth AI in this specific product, because it sits exactly on
top of the human-review checkpoint the whole app is already designed
around — it assists the reviewer's judgment, it doesn't replace it. Don't
build this yet; it depends on Phase 8's review UI existing first.

**Don't build:** a general-purpose "ask anything about your job" chatbot.
It's a plausible idea but not clearly tied to making the core
upload → review → export path work better, and risks becoming a
side-project instead of finishing the MVP.

---

## Suggested order

1. Multi-page wizard restructure (Change 1) — foundational, everything
   else attaches to it.
2. Cancel and delete (Change 2) — natural now that there's a shared
   layout to put the controls in.
3. LLM-based schema builder (Change 3, recommendation 1) — contained,
   independent, fixes a known real bug.

After each one: run `npm run dev`, click through the affected flow
manually, confirm nothing regressed in the other two steps, then commit
before moving to the next.
