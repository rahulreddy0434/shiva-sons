/**
 * What error reports may contain, and which failures are worth a report.
 * Kept free of the Sentry SDK so it can be tested on its own.
 */

/** The parts of a Sentry event these rules touch. */
export interface ReportEvent {
  request?: { cookies?: unknown; data?: unknown; headers?: Record<string, string>; query_string?: unknown; url?: string }
  user?: { id?: string | number; email?: string; ip_address?: string | null; username?: string }
  extra?: Record<string, unknown>
}

/**
 * Removes anything that could carry customer data before a report leaves:
 * cookies (the sign-in session), request bodies (document text, field
 * values), headers other than the browser name, query strings (link tokens),
 * and the user's email and address. The user's id is kept so repeated errors
 * for one account can be grouped.
 */
export function scrubEvent<T extends ReportEvent>(event: T): T {
  if (event.request) {
    delete event.request.cookies
    delete event.request.data
    delete event.request.query_string
    const agent = event.request.headers?.['user-agent'] ?? event.request.headers?.['User-Agent']
    event.request.headers = agent ? { 'user-agent': agent } : {}
    if (event.request.url) event.request.url = event.request.url.split('?')[0]
  }
  if (event.user) event.user = event.user.id === undefined ? {} : { id: event.user.id }
  delete event.extra
  return event
}

/**
 * Failures that are not bugs and would only fill the inbox: the AI service
 * being busy or out of its free quota. The user already sees why and can retry.
 */
export function isExpectedFailure(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status
  return status === 429 || status === 503
}
