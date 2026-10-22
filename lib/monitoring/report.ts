import * as Sentry from '@sentry/nextjs'
import { isExpectedFailure, scrubEvent } from './rules'

/**
 * Error monitoring with Sentry (docs/DEPLOYMENT.md → Monitoring). Off unless
 * NEXT_PUBLIC_SENTRY_DSN is set, so local development and tests send nothing.
 */
export function sentryOptions(): Sentry.BrowserOptions | null {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
  if (!dsn) return null
  return {
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? 'development',
    // Errors only: no performance tracing or session recordings, which would
    // use up the free plan and could capture what is on the screen
    tracesSampleRate: 0,
    // Collect nothing about people or requests in the first place;
    // scrubEvent below removes anything that still gets through
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
    },
    beforeSend: (event) => scrubEvent(event),
  }
}

/**
 * Reports a failure that a route caught and answered politely, so it still
 * reaches the developer. Expected failures (the AI busy or out of quota) are
 * left out. Safe to call when monitoring is off.
 */
export function reportError(err: unknown, where: string): void {
  if (isExpectedFailure(err)) return
  Sentry.captureException(err, { tags: { where } })
}
