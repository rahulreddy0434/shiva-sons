'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    if (error) { setError(error.message); return }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-[#DADDD5] rounded-lg p-7 space-y-4">
      <h1 className="text-lg font-medium">Sign in</h1>
      {error && <p className="text-sm text-[#B5522E]">{error}</p>}
      <div>
        <label className="block text-sm font-medium mb-1">Email</label>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
          className="w-full border border-[#DADDD5] rounded-md px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Password</label>
        <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
          className="w-full border border-[#DADDD5] rounded-md px-3 py-2 text-sm" />
      </div>
      <button type="submit" disabled={loading}
        className="w-full bg-[#A97C33] text-white rounded-md py-2 text-sm font-medium disabled:opacity-60">
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
      <div className="flex justify-between text-sm text-[#5B6B78]">
        <Link href="/reset-password" className="text-[#A97C33]">Forgot password?</Link>
        <Link href="/sign-up" className="text-[#A97C33]">Sign up</Link>
      </div>
    </form>
  )
}