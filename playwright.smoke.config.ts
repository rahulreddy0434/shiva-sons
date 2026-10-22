import { defineConfig } from '@playwright/test'

/**
 * Checks a deployed site instead of a local server: a Vercel preview before
 * merging, or the live site after (docs/DEPLOYMENT.md → Checking a deployment).
 *
 *   SMOKE_URL=https://<preview>.vercel.app npm run test:smoke
 *
 * Vercel keeps previews behind its own sign-in. With the project's
 * "Protection Bypass for Automation" secret in VERCEL_AUTOMATION_BYPASS_SECRET
 * (in .env.local, never committed) every request carries it and gets through.
 */
try {
  process.loadEnvFile('.env.local')
} catch {
  // No .env.local (for example in CI): the variables must come from the environment
}

const baseURL = process.env.SMOKE_URL ?? 'https://shiva-sons.vercel.app'
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

export default defineConfig({
  testDir: 'e2e-smoke',
  outputDir: 'test-results/smoke',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    channel: 'chromium',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    extraHTTPHeaders: bypass
      ? { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'samesitenone' }
      : {},
  },
})
