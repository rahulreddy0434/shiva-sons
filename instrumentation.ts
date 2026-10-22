import * as Sentry from '@sentry/nextjs'
import { sentryOptions } from '@/lib/monitoring/report'

/** Starts error monitoring on the server (see lib/monitoring/report.ts). */
export async function register() {
  const options = sentryOptions()
  if (options) Sentry.init(options)
}

/** Errors no route caught: Next.js hands them to Sentry. */
export const onRequestError = Sentry.captureRequestError
