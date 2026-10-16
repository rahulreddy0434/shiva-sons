import { describe, expect, it, vi } from 'vitest'
import { securityHeaders } from './security-headers'

const policyOf = (isDev: boolean) =>
  securityHeaders({ supabaseUrl: 'https://abc.supabase.co/', isDev }).find((h) => h.key === 'Content-Security-Policy')!
    .value

describe('securityHeaders', () => {
  it('refuses to be framed by other sites', () => {
    const headers = securityHeaders({ supabaseUrl: 'https://abc.supabase.co', isDev: false })
    expect(headers).toContainEqual({ key: 'X-Frame-Options', value: 'DENY' })
    expect(policyOf(false)).toContain("frame-ancestors 'none'")
  })

  it('lets the pages reach this Supabase project only, over https and websockets', () => {
    expect(policyOf(false)).toContain("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co")
    expect(policyOf(false)).toContain("img-src 'self' data: blob: https://abc.supabase.co")
  })

  it('does not stop the build when the Supabase address is missing or malformed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const supabaseUrl of [undefined, '', 'not a url']) {
      const policy = securityHeaders({ supabaseUrl, isDev: false }).find((h) => h.key === 'Content-Security-Policy')!.value
      expect(policy).toContain("connect-src 'self';")
      expect(policy).not.toContain('undefined')
    }
    warn.mockRestore()
  })

  it('allows the PDF viewer’s WebAssembly decoders but no eval in production', () => {
    expect(policyOf(false)).toContain("'wasm-unsafe-eval'")
    expect(policyOf(false)).not.toContain("'unsafe-eval'")
    expect(policyOf(true)).toContain("'unsafe-eval'")
  })
})
