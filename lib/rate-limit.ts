import type { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type LimitedAction = 'ocr' | 'extract' | 'schema'

/** Per user, per rolling hour. Generous for real use; a stop on runaway loops and abuse. */
export const RATE_LIMITS: Record<LimitedAction, { max: number; what: string }> = {
  ocr: { max: 200, what: 'documents read' },
  extract: { max: 200, what: 'documents extracted' },
  schema: { max: 30, what: 'field lists generated' },
}

const WINDOW_MINUTES = 60

export function isOverLimit(action: LimitedAction, countInWindow: number): boolean {
  return countInWindow >= RATE_LIMITS[action].max
}

export function limitMessage(action: LimitedAction): string {
  const { max, what } = RATE_LIMITS[action]
  return `You have reached the limit of ${max} ${what} per hour. Please wait a while and try again.`
}

/**
 * Counts this user's recent calls and records the new one. Returns a message
 * when the call should be refused, or null when it may go ahead.
 *
 * If the usage table cannot be read (for example the migration has not been
 * applied yet) the call is allowed and the problem is logged: a broken
 * limiter must not take the product down.
 */
export async function checkRateLimit(supabase: Supabase, userId: string, action: LimitedAction): Promise<string | null> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString()

  const { count, error } = await supabase
    .from('api_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', action)
    .gte('created_at', since)

  if (error) {
    console.warn(`Rate limit check skipped for ${action}: ${error.message}`)
    return null
  }
  if (isOverLimit(action, count ?? 0)) return limitMessage(action)

  const { error: insertError } = await supabase.from('api_usage').insert({ user_id: userId, action })
  if (insertError) console.warn(`Rate limit usage not recorded for ${action}: ${insertError.message}`)

  return null
}
