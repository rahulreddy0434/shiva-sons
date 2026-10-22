'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, LogOut, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/** Top-right account menu: who is signed in, Settings and Sign out. */
export function ProfileMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const initial = email.trim().charAt(0).toUpperCase() || '?'

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  async function signOut() {
    await createClient().auth.signOut()
    // Back to the public website, where they can sign in again or look around
    router.push('/')
    router.refresh()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Your account"
        className="flex items-center gap-1 rounded-full border border-line py-1 pl-1 pr-2 hover:bg-surface"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-sm font-medium text-white">
          {initial}
        </span>
        <ChevronDown size={14} className="text-ink-muted" aria-hidden />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-line bg-white py-1 shadow-lg">
          <div className="border-b border-line px-4 py-2.5">
            <p className="text-xs text-ink-muted">Signed in as</p>
            <p className="text-sm text-ink break-all">{email}</p>
          </div>
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-ink hover:bg-surface"
          >
            <Settings size={15} aria-hidden /> Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ink hover:bg-surface"
          >
            <LogOut size={15} aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
