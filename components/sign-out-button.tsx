'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function SignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    // Back to the public website, where they can sign in again or look around
    router.push('/')
    router.refresh()
  }

  return (
    <button onClick={handleSignOut} className="text-xs text-ink-muted hover:text-ink text-left">
      Sign out
    </button>
  )
}