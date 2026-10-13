import { defineConfig } from '@playwright/test'

// E2E_EMAIL / E2E_PASSWORD (a dedicated test account) live in .env.local
try {
  process.loadEnvFile('.env.local')
} catch {
  // No .env.local (for example in CI): the variables must come from the environment
}

const PORT = 3100

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Full Chromium in headless mode: unlike the default headless shell it
    // includes the PDF viewer the review screen embeds
    channel: 'chromium',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // The tests start their own server in mock mode, so no OCR or AI calls are
  // made and no quota is used. Supabase is real: they run as the test account.
  // Stop any other `next dev` in this folder first — two cannot share it.
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    env: { MOCK_AI: 'true' },
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
