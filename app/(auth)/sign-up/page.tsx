'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) { setError(error.message); return }
    setMessage('Check your email to confirm your account, then sign in.')
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-line rounded-lg p-7 space-y-4">
      <h1 className="text-lg font-medium">Create an account</h1>
      {error && <p className="text-sm text-danger">{error}</p>}
      {message && <p className="text-sm text-success">{message}</p>}
      <div>
        <label className="block text-sm font-medium mb-1">Email</label>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
          className="w-full border border-line rounded-md px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Password</label>
        <div className="relative">
          <input type={showPassword ? 'text' : 'password'} required minLength={6}
            value={password} onChange={e => setPassword(e.target.value)}
            className="w-full border border-line rounded-md px-3 py-2 pr-10 text-sm" />
          <button type="button" onClick={() => setShowPassword(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted">
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Confirm password</label>
        <input type={showPassword ? 'text' : 'password'} required minLength={6}
          value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
          className="w-full border border-line rounded-md px-3 py-2 text-sm" />
      </div>
      <button type="submit" disabled={loading}
        className="w-full bg-brand text-white rounded-md py-2 text-sm font-medium disabled:opacity-60">
        {loading ? 'Creating account…' : 'Sign up'}
      </button>
      <p className="text-sm text-center text-ink-muted">
        Already have an account? <Link href="/sign-in" className="text-brand-blue hover:underline">Sign in</Link>
      </p>
    </form>
  )
}