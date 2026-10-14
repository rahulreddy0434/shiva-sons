# Shiva Sons Technologies — Document to Excel

Turn handwritten or printed timecards into structured Excel data: upload your
workbook, describe the fields, upload timecards, review every result beside
the original document, approve, and export.

The product is under active development — see
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for what works today.

## Contributors

1. Rahul
2. Sri
3. Yogi

## Setup

1. Install Node.js 20 or newer, then `npm install`.
2. Copy `.env.example` to `.env.local` and fill in the Supabase, Azure
   Document Intelligence, and Gemini values (the file says where each comes from).
3. Apply the database schema to your Supabase project — see
   [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#migrations).
4. `npm run dev` and open http://localhost:3000.

## Commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Development server |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser end-to-end tests (Playwright, mock mode). Stop `npm run dev` first; needs `E2E_EMAIL` / `E2E_PASSWORD` in `.env.local` and `npx playwright install chromium` once |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run build` | Production build |

## Documentation

- [docs/PRD.md](docs/PRD.md) — product requirements
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, data model, security, LLM costs
- [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) — progress and next steps
