'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { friendlyAuthError } from '@/lib/auth-errors'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPassword />
    </Suspense>
  )
}

function ResetPassword() {
  // /auth/confirm sends a working reset link here with ?step=new, already signed in
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [mode, setMode] = useState<'request' | 'update'>(params.get('step') === 'new' ? 'update' : 'request')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Links in emails sent before the new templates arrive this way
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('update')
    })
    return () => listener.subscription.unsubscribe()
  }, [supabase])

  async function requestReset(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?type=recovery`,
    })
    setBusy(false)
    if (error) { setError(friendlyAuthError(error.message)); return }
    setMessage(`If ${email} has an account, a reset link is on its way. Open it on any device; check your spam folder too.`)
  }

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setBusy(false)
    if (error) { setError(friendlyAuthError(error.message)); return }
    setMessage('Password updated. Taking you to your dashboard…')
    router.push('/dashboard')
    router.refresh()
  }

  if (mode === 'update') {
    return (
      <form onSubmit={updatePassword} className="bg-white border border-line rounded-lg p-7 space-y-4">
        <h1 className="text-lg font-medium">Set a new password</h1>
        {error && <p className="text-sm text-danger">{error}</p>}
        {message && <p className="text-sm text-success">{message}</p>}
        <label htmlFor="new-password" className="block text-sm font-medium">New password (at least 6 characters)</label>
        <input id="new-password" type="password" required minLength={6} value={newPassword} onChange={e => setNewPassword(e.target.value)}
          autoComplete="new-password" className="w-full border border-line rounded-md px-3 py-2 text-sm" />
        <button type="submit" disabled={busy} className="w-full bg-brand text-white rounded-md py-2 text-sm font-medium disabled:opacity-60">
          {busy ? 'Saving…' : 'Update password'}
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={requestReset} className="bg-white border border-line rounded-lg p-7 space-y-4">
      <h1 className="text-lg font-medium">Reset your password</h1>
      <p className="text-sm text-ink-muted">We will email you a link to choose a new password.</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      {message && <p className="text-sm text-success">{message}</p>}
      <label htmlFor="email" className="block text-sm font-medium">Email</label>
      <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)}
        className="w-full border border-line rounded-md px-3 py-2 text-sm" />
      <button type="submit" disabled={busy} className="w-full bg-brand text-white rounded-md py-2 text-sm font-medium disabled:opacity-60">
        {busy ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  )
}
