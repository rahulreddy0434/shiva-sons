# Deployment checklist (Vercel)

Nothing here has been done yet — the app has only run locally. Work through
this before inviting a real customer.

## Must fix before going live

- [ ] **Uploads over ~4.5 MB.** Uploads currently pass through a route
      handler, and Vercel caps a serverless request body at about 4.5 MB
      (confirm the current figure in Vercel's limits documentation). The app
      allows 20 MB. Change uploads to go straight from the browser to
      Supabase Storage (the storage policies already confine each user to
      their own folder), then have the server verify and register the file.
- [ ] **Function time limits.** OCR and extraction each run inside one
      request per document; a busy AI call took about two minutes in testing.
      Set `maxDuration` on those routes to what your Vercel plan allows, and
      move to background processing if documents regularly exceed it.
- [ ] **A paid AI key.** The Gemini free tier allowed about 20 requests a day
      in testing and its terms let Google use the content sent. Enable billing
      or switch provider (see ARCHITECTURE.md → LLM provider and cost).
- [ ] **Retention for inactive accounts.** Originals are removed 30 days after
      a job's last change, but only when that user next opens their dashboard.
      Add a scheduled job (Vercel Cron calling a protected route that uses the
      service-role client) so accounts that never return are covered too.

## Environment variables

Set in Vercel → Project → Settings → Environment Variables. See `.env.example`.

- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — server only; used for account deletion
- [ ] `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`, `AZURE_DOCUMENT_INTELLIGENCE_KEY`
- [ ] `GEMINI_API_KEY`
- [ ] `MOCK_AI` is **unset or false** in production
- [ ] `E2E_*` variables are **not** set in production

## Supabase

- [ ] All migrations applied: `supabase migration list --linked` shows every
      local migration with a remote timestamp
- [ ] Auth → URL Configuration: Site URL and redirect URLs point at the
      production domain (password-reset links use them)
- [ ] Auth → email: a real SMTP sender, so sign-up and reset emails arrive
- [ ] Decide whether sign-up stays open to anyone or is limited
- [ ] Remove the test accounts (`claude-wizard-test@example.com`,
      `claude-wizard-test-2@example.com`) or keep them out of production
- [ ] Database backups enabled on the Supabase plan in use

## Checks to run against the deployed site

- [ ] `npm run build` passes (also run by Vercel)
- [ ] Sign up with a new email, confirm, sign in, reset the password
- [ ] One real job end to end with a real template and timecard, and the
      downloaded workbook opened in Excel
- [ ] A second account cannot open the first account's job URL
- [ ] Privacy and terms pages reviewed — they are still marked as drafts

## Known limits to tell early customers

- `.xlsx` only; macros, pivot tables and charts in a template are not supported
- Handwriting is read imperfectly — names in particular; every value should
  be checked in Review
- A very long PDF holding many cards may be too large to extract in one go;
  split it into smaller files
