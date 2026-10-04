import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Shiva Sons',
  description: 'AI-powered document to Excel extraction',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}