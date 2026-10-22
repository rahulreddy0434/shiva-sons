import { describe, expect, it } from 'vitest'
import { isExpectedFailure, scrubEvent } from './rules'

describe('scrubEvent', () => {
  it('keeps no cookies, bodies, tokens, email or IP address in a report', () => {
    const event = scrubEvent({
      request: {
        url: 'https://shiva-sons.vercel.app/auth/confirm?token_hash=secret&type=recovery',
        cookies: { 'sb-access-token': 'x' },
        data: { fields: [{ key: 'name', value: 'Maria Lopez' }] },
        query_string: 'token_hash=secret',
        headers: { cookie: 'sb=…', authorization: 'Bearer x', 'user-agent': 'Mozilla/5.0' },
      },
      user: { id: 'u-1', email: 'owner@example.com', ip_address: '203.0.113.9' },
      extra: { body: 'document text' },
    })
    expect(event).toEqual({
      request: { url: 'https://shiva-sons.vercel.app/auth/confirm', headers: { 'user-agent': 'Mozilla/5.0' } },
      user: { id: 'u-1' },
    })
  })
})

describe('isExpectedFailure', () => {
  it('does not report the AI being busy or out of quota', () => {
    expect(isExpectedFailure({ status: 503 })).toBe(true)
    expect(isExpectedFailure({ status: 429 })).toBe(true)
    expect(isExpectedFailure({ status: 401 })).toBe(false)
    expect(isExpectedFailure(new Error('Azure Document Intelligence rejected the document'))).toBe(false)
  })
})
