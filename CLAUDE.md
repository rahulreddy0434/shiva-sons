@AGENTS.md

# Shiva Sons Technologies

AI document-to-Excel app: timecards in, reviewed and approved Excel out.

- Requirements: `docs/PRD.md` — read before changing behaviour.
- How it is built: `docs/ARCHITECTURE.md`
- What is done and what is next: `docs/IMPLEMENTATION_PLAN.md` — update it when a milestone lands.

## Rules that must not be broken

- The review screen shows the original document beside editable extracted
  data. Never split it into separate pages or reduce it to download-only.
- Never mark data approved automatically, and never export unapproved data.
- Never invent or silently correct an extracted value; flag it instead.
- Every user-owned table gets a `user_id` column and an `own rows` RLS policy.
- The service-role key is never used in client code.

## Commands

```
npm run dev        # dev server on :3000
npm test           # Vitest unit tests
npm run test:e2e   # Playwright, mock mode (stop the dev server first)
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint
supabase db push   # apply migrations (see ARCHITECTURE.md → Migrations first)
```

## Conventions

- Colours come from the tokens in `app/globals.css` (`bg-brand`, `text-ink-muted`,
  `border-line`, …). Do not hard-code hex values in components.
- Logic lives in `lib/` and gets a `*.test.ts` beside it; route handlers and
  components stay thin.
- Only `lib/llm/provider.ts` talks to a model; only `lib/azure/` talks to Azure.
  Both have a mock (`MOCK_AI=true`) whose output must stay obviously fake.
- Schema changes go in a new file under `supabase/migrations/`, additive where possible.
- Run tests, typecheck and lint before calling a milestone done, and record
  what was and was not verified in the plan's verification log.
