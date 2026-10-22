import type { EmailOtpType } from '@supabase/supabase-js'

/** The kinds of email link Supabase sends that /auth/confirm accepts. */
const LINK_TYPES: EmailOtpType[] = ['signup', 'email', 'recovery', 'invite', 'magiclink', 'email_change']

export function isLinkType(value: string | null): value is EmailOtpType {
  return value !== null && (LINK_TYPES as string[]).includes(value)
}

/**
 * A `next` address from a link, only if it stays on this site: a path such as
 * "/dashboard", never "//elsewhere.com" or a full URL, so a crafted link cannot
 * send someone to another website after signing them in.
 */
export function safeNextPath(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null
  return next
}

/** Where a person lands once their link has worked. */
export function destinationFor(type: EmailOtpType | null, next: string | null): string {
  if (type === 'recovery') return '/reset-password?step=new'
  if (type === 'email_change') return '/settings?email=changed'
  return safeNextPath(next) ?? '/dashboard?confirmed=1'
}

/** Why a link failed, for the page that explains it. */
export function linkProblem(message: string | undefined): 'expired' | 'invalid' {
  return /expired|already|used|invalid.*(token|otp)|otp/i.test(message ?? '') ? 'expired' : 'invalid'
}
