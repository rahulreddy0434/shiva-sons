'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { friendlyAuthError } from '@/lib/auth-errors'

/** Where /auth/confirm sends a link that did not work, with a way to get a new one. */
export default function LinkProblemPage() {
  return (
    <Suspense>
      <LinkProblem />
    </Suspense>
  )
}

function LinkProblem() {
  const params = useSearchParams()
  const expired = params.get('reason') === 'expired'
  const isReset = params.get('type') === 'recovery'
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function sendNewLink(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    const supabase = createClient()
    const { error } = isReset
      ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/confirm?type=recovery` })
      : await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/auth/confirm` } })
    setSending(false)
    if (error) {
      setError(friendlyAuthError(error.message))
      return
    }
    setMessage('A new link is on its way. Open the newest email; earlier links no longer work.')
  }

  return (
    <div className="bg-white border border-line rounded-lg p-7 space-y-4">
      <h1 className="text-lg font-medium">{expired ? 'This link has expired' : 'This link did not work'}</h1>
      <p className="text-sm text-ink-muted">
        {expired
          ? 'Each link works once and only for a limited time. It may also have been opened already, for example by your email app checking it.'
          : 'The link may be incomplete. Copying it from the email by hand sometimes cuts it short.'}{' '}
        {isReset ? 'Ask for a new password-reset link below.' : 'Ask for a new confirmation email below.'}
      </p>
      <p className="text-sm text-ink-muted">
        Already confirmed your email?{' '}
        <Link href="/sign-in" className="text-brand-blue hover:underline">
          Sign in
        </Link>
        .
      </p>
      {message ? (
        <p className="text-sm text-success">✓ {message}</p>
      ) : (
        <form onSubmit={sendNewLink} className="space-y-3">
          <label htmlFor="email" className="block text-sm font-medium">
            Your email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-line rounded-md px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={sending}
            className="w-full bg-brand text-white rounded-md py-2 text-sm font-medium disabled:opacity-60"
          >
            {sending ? 'Sending…' : isReset ? 'Send a new reset link' : 'Send a new confirmation email'}
          </button>
        </form>
      )}
    </div>
  )
}
