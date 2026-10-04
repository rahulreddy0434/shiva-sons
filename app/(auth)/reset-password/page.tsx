'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [mode, setMode] = useState<'request' | 'update'>('request')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('update')
    })
    return () => listener.subscription.unsubscribe()
  }, [supabase])

  async function requestReset(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) { setError(error.message); return }
    setMessage('Check your email for a reset link.')
  }

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) { setError(error.message); return }
    setMessage('Password updated — you can sign in now.')
  }

  if (mode === 'update') {
    return (
      <form onSubmit={updatePassword} className="bg-white border border-[#DADDD5] rounded-lg p-7 space-y-4">
        <h1 className="text-lg font-medium">Set a new password</h1>
        {error && <p className="text-sm text-[#B5522E]">{error}</p>}
        {message && <p className="text-sm text-[#3F6B4E]">{message}</p>}
        <input type="password" required minLength={6} value={newPassword} onChange={e => setNewPassword(e.target.value)}
          className="w-full border border-[#DADDD5] rounded-md px-3 py-2 text-sm" placeholder="New password" />
        <button type="submit" className="w-full bg-[#A97C33] text-white rounded-md py-2 text-sm font-medium">
          Update password
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={requestReset} className="bg-white border border-[#DADDD5] rounded-lg p-7 space-y-4">
      <h1 className="text-lg font-medium">Reset your password</h1>
      {error && <p className="text-sm text-[#B5522E]">{error}</p>}
      {message && <p className="text-sm text-[#3F6B4E]">{message}</p>}
      <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
        className="w-full border border-[#DADDD5] rounded-md px-3 py-2 text-sm" placeholder="Email" />
      <button type="submit" className="w-full bg-[#A97C33] text-white rounded-md py-2 text-sm font-medium">
        Send reset link
      </button>
    </form>
  )
}