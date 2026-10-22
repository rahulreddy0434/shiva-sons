'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/extraction/new', label: 'New extraction' },
  // A job's own pages count as being in Jobs
  { href: '/jobs', label: 'Jobs', alsoActive: /^\/extraction\/(?!new)/ },
]

/** The sidebar links, with the page you are on highlighted. */
export function NavLinks() {
  const pathname = usePathname()
  return (
    <nav className="flex flex-wrap gap-1 text-sm md:flex-col">
      {NAV_LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`) || link.alsoActive?.test(pathname)
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`px-3 py-2 rounded-md ${
              active ? 'bg-brand-blue-soft text-brand-blue font-medium' : 'text-ink hover:bg-brand-blue-soft hover:text-brand-blue'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
