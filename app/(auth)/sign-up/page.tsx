'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) { setError(error.message); return }
    setMessage('Check your email to confirm your account, then sign in.')
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-[#DADDD5] rounded-lg p-7 space-y-4">
      <h1 className="text-lg font-medium">Create an account</h1>
      {error && <p className="text-sm text-[#B5522E]">{error}</p>}
      {message && <p className="text-sm text-[#3F6B4E]">{message}</p>}
      <div>
        <label className="block text-sm font-medium mb-1">Email</label>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
          className="w-full border border-[#DADDD5] rounded-md px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Password</label>
        <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
          className="w-full border border-[#DADDD5] rounded-md px-3 py-2 text-sm" />
      </div>
      <button type="submit" disabled={loading}
        className="w-full bg-[#A97C33] text-white rounded-md py-2 text-sm font-medium disabled:opacity-60">
        {loading ? 'Creating account…' : 'Sign up'}
      </button>
      <p className="text-sm text-center text-[#5B6B78]">
        Already have an account? <Link href="/sign-in" className="text-[#A97C33]">Sign in</Link>
      </p>
    </form>
  )
}