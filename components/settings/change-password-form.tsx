'use client'

import { useState } from 'react'
import { friendlyAuthError } from '@/lib/auth-errors'
import { createClient } from '@/lib/supabase/client'

const MIN_LENGTH = 8

export function ChangePasswordForm() {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setError(null)

    if (password !== confirmation) {
      setError('The two passwords do not match.')
      return
    }

    setSaving(true)
    const { error } = await createClient().auth.updateUser({ password })
    setSaving(false)

    if (error) {
      setError(friendlyAuthError(error.message))
      return
    }
    setPassword('')
    setConfirmation('')
    setMessage('Password updated.')
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-3">
      <div>
        <label htmlFor="new-password" className="block text-sm font-medium mb-1">New password</label>
        <input
          id="new-password"
          type="password"
          required
          minLength={MIN_LENGTH}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-line rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="confirm-password" className="block text-sm font-medium mb-1">Repeat new password</label>
        <input
          id="confirm-password"
          type="password"
          required
          minLength={MIN_LENGTH}
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          className="w-full border border-line rounded-md px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-danger">✕ {error}</p>}
      {message && <p className="text-sm text-success">✓ {message}</p>}
      <button
        type="submit"
        disabled={saving}
        className="bg-brand text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Change password'}
      </button>
    </form>
  )
}
