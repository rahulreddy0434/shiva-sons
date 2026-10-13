import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/sign-out-button'
import { isMockMode } from '@/lib/mock/mode'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/extraction/new', label: 'New extraction' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/settings', label: 'Settings' },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/sign-in')

  return (
    <div className="flex min-h-screen flex-col bg-white text-ink md:flex-row">
      <aside className="shrink-0 border-b border-line bg-white p-4 md:w-56 md:border-b-0 md:border-r md:p-6 flex flex-col">
        <p className="text-lg font-semibold text-ink">
          Shiva Sons <span className="text-brand">Technologies</span>
        </p>
        <p className="text-xs text-ink-muted mb-4 md:mb-8">Document to Excel</p>
        <nav className="flex flex-wrap gap-1 text-sm md:flex-col">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-3 py-2 rounded-md text-ink hover:bg-brand-blue-soft hover:text-brand-blue"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 pt-4 border-t border-line text-xs text-ink-muted space-y-2 md:mt-auto md:pt-5">
          <p className="break-all">{user.email}</p>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 p-5 md:p-10">
        {isMockMode() && (
          <p role="status" className="mb-6 rounded-md border border-brand bg-brand-soft px-4 py-2 text-sm text-brand-strong">
            ⚠ Mock mode is on. Documents are not being read: every extracted value is made-up test data.
          </p>
        )}
        {children}
      </main>
    </div>
  )
}
