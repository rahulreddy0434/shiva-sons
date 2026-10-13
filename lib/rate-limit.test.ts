import { describe, expect, it, vi } from 'vitest'
import { checkRateLimit, isOverLimit, limitMessage, RATE_LIMITS } from './rate-limit'

/** Minimal stand-in for the two Supabase calls the limiter makes. */
function fakeSupabase(countResult: { count: number | null; error: { message: string } | null }, insertError: { message: string } | null = null) {
  const insert = vi.fn().mockResolvedValue({ error: insertError })
  const query = {
    select: () => query,
    eq: () => query,
    gte: () => Promise.resolve(countResult),
    insert,
  }
  return { client: { from: () => query } as never, insert }
}

describe('isOverLimit', () => {
  it('refuses at the limit, not one past it', () => {
    expect(isOverLimit('schema', RATE_LIMITS.schema.max - 1)).toBe(false)
    expect(isOverLimit('schema', RATE_LIMITS.schema.max)).toBe(true)
    expect(isOverLimit('schema', RATE_LIMITS.schema.max + 5)).toBe(true)
  })
})

describe('checkRateLimit', () => {
  it('allows a call under the limit and records it', async () => {
    const { client, insert } = fakeSupabase({ count: 3, error: null })
    expect(await checkRateLimit(client, 'user-1', 'ocr')).toBeNull()
    expect(insert).toHaveBeenCalledWith({ user_id: 'user-1', action: 'ocr' })
  })

  it('refuses at the limit without recording another call', async () => {
    const { client, insert } = fakeSupabase({ count: RATE_LIMITS.extract.max, error: null })
    expect(await checkRateLimit(client, 'user-1', 'extract')).toBe(limitMessage('extract'))
    expect(insert).not.toHaveBeenCalled()
  })

  it('lets the call through when the usage table cannot be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client, insert } = fakeSupabase({ count: null, error: { message: 'relation "api_usage" does not exist' } })
    expect(await checkRateLimit(client, 'user-1', 'schema')).toBeNull()
    expect(insert).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('still allows the call when recording it fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client } = fakeSupabase({ count: 0, error: null }, { message: 'insert failed' })
    expect(await checkRateLimit(client, 'user-1', 'ocr')).toBeNull()
    warn.mockRestore()
  })
})
