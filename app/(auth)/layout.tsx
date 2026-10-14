import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-2xl font-semibold text-ink mb-8 text-center">
          Shiva Sons
        </Link>
        {children}
        <p className="mt-6 text-center text-sm">
          <Link href="/" className="text-brand-blue hover:underline">
            ← Back to the website
          </Link>
        </p>
      </div>
    </div>
  )
}
