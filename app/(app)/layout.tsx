import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { NavLinks } from '@/components/nav-links'
import { ProfileMenu } from '@/components/profile-menu'
import { isMockMode } from '@/lib/mock/mode'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/sign-in')

  return (
    <div className="flex min-h-screen flex-col bg-white text-ink md:flex-row">
      <aside className="shrink-0 border-b border-line bg-white p-4 md:w-56 md:border-b-0 md:border-r md:p-6 flex flex-col">
        <Link href="/dashboard" className="text-lg font-semibold text-ink">
          Shiva Sons <span className="text-brand">Technologies</span>
        </Link>
        <p className="text-xs text-ink-muted mb-4 md:mb-8">Document to Excel</p>
        <NavLinks />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-4 border-b border-line px-5 py-3 md:px-10">
          <Link href="/" className="flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
            Website <ExternalLink size={13} aria-hidden />
          </Link>
          <ProfileMenu email={user.email ?? ''} />
        </header>
        <main className="flex-1 p-5 md:p-10">
          {isMockMode() && (
            <p role="status" className="mb-6 rounded-md border border-brand bg-brand-soft px-4 py-2 text-sm text-brand-strong">
              ⚠ Mock mode is on. Documents are not being read: every extracted value is made-up test data.
            </p>
          )}
          {children}
        </main>
      </div>
    </div>
  )
}
