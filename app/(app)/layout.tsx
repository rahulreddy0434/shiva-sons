import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/sign-out-button'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/sign-in')

  return (
    <div className="flex min-h-screen bg-[#F1F3EF]">
      <aside className="w-56 shrink-0 bg-[#1E2B3A] text-[#C7D0D6] p-6 flex flex-col">
        <p className="text-white font-semibold text-lg mb-1">Shiva Sons</p>
        <p className="text-xs text-[#7E8E98] mb-8">Document to Excel</p>
        <nav className="flex flex-col gap-1 text-sm">
          <Link href="/dashboard" className="px-3 py-2 rounded hover:bg-white/5">Dashboard</Link>
          <Link href="/extraction/new" className="px-3 py-2 rounded hover:bg-white/5">New Extraction</Link>
          <Link href="/jobs" className="px-3 py-2 rounded hover:bg-white/5">Jobs</Link>
          <Link href="/settings" className="px-3 py-2 rounded hover:bg-white/5">Settings</Link>
        </nav>
       <div className="mt-auto pt-5 border-t border-white/10 text-xs text-[#7E8E98] space-y-2">
  <p>{user.email}</p>
  <SignOutButton />
</div>
      </aside>
      <main className="flex-1 p-10">{children}</main>
    </div>
  )
}