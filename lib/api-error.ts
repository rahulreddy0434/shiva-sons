import { NextResponse } from 'next/server'

/** What the user sees when the server could not finish something, and no better wording fits. */
export const GENERIC_FAILURE = 'Something went wrong on our side'

/**
 * A 500 answer with wording fit for the user. The database's own message is
 * logged for the developer (Vercel → Logs) and never shown: it means nothing
 * to the user and can describe how the data is stored.
 */
export function serverError(userMessage: string, cause: unknown) {
  const detail = cause instanceof Error ? cause.message : (cause as { message?: string } | null)?.message ?? cause
  console.error(`${userMessage}:`, detail)
  return NextResponse.json({ error: `${userMessage}. Please try again.` }, { status: 500 })
}
