'use client'

import { useState } from 'react'
import { friendlyAuthError } from '@/lib/auth-errors'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { setError(friendlyAuthError(error.message)); return }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-line rounded-lg p-7 space-y-4">
      <h1 className="text-lg font-medium">Sign in</h1>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div>
        <label className="block text-sm font-medium mb-1">Email</label>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
          className="w-full border border-line rounded-md px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Password</label>
        <div className="relative">
          <input type={showPassword ? 'text' : 'password'} required
            value={password} onChange={e => setPassword(e.target.value)}
            className="w-full border border-line rounded-md px-3 py-2 pr-10 text-sm" />
          <button type="button" onClick={() => setShowPassword(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted">
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      <button type="submit" disabled={loading}
        className="w-full bg-brand text-white rounded-md py-2 text-sm font-medium disabled:opacity-60">
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
      <div className="flex justify-between text-sm text-ink-muted">
        <Link href="/reset-password" className="text-brand-blue hover:underline">Forgot password?</Link>
        <Link href="/sign-up" className="text-brand-blue hover:underline">Sign up</Link>
      </div>
    </form>
  )
}