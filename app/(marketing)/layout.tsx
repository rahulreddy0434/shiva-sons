import Link from 'next/link'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link href="/" className="text-lg font-semibold text-ink">
            Shiva Sons <span className="text-brand">Technologies</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <Link href="/#how-it-works" className="text-ink-muted hover:text-ink">How it works</Link>
            <Link href="/#features" className="text-ink-muted hover:text-ink">Features</Link>
            <Link href="/sign-in" className="text-brand-blue hover:underline">Log in</Link>
            <Link href="/sign-up" className="bg-brand text-white font-medium rounded-md px-4 py-2">
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-ink-muted">
          <p>© {new Date().getFullYear()} Shiva Sons Technologies</p>
          <nav className="flex gap-5">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
