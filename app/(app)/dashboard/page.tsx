import Link from 'next/link'
import { after } from 'next/server'
import { CheckCircle2, Download, FileSpreadsheet, ListChecks, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { purgeExpiredDocuments } from '@/lib/retention'
import { dashboardNumbers } from '@/lib/dashboard'

const STEPS = [
  { icon: FileSpreadsheet, title: 'Excel template', text: 'Upload the workbook you want filled, or use our standard timecard template.' },
  { icon: ListChecks, title: 'Fields', text: 'Create the fields from your columns, then choose which ones every record must have.' },
  { icon: Upload, title: 'Documents', text: 'Upload scans, photos or PDFs of the timecards. We read them and extract the values.' },
  { icon: CheckCircle2, title: 'Review', text: 'Check every record side by side with the original page and correct anything flagged.' },
  { icon: Download, title: 'Approve & export', text: 'Approve the checked data and download your completed Excel file.' },
]

const TIPS = [
  'Scans and photos work best flat, well lit and with the whole card in view; a tilted phone photo is fine.',
  'One card per page, or a card over two pages, reads most reliably. A PDF can hold many cards.',
  'PDF, JPG or PNG, up to 20 MB per file and 100 MB per upload.',
  'Mark the fields that identify a person, such as ID or name, as Required. Then a card missing them is flagged.',
  'Handwriting is read imperfectly. Look at every ⚠ in Review, and compare totals with the card.',
  'Original documents are removed 30 days after a job was last changed; your Excel files are kept.',
]

export default async function DashboardPage() {
  const supabase = await createClient()
  const [{ data: jobs }, { data: exports }, { count: pagesRead }] = await Promise.all([
    supabase.from('extraction_jobs').select('status'),
    supabase.from('export_files').select('record_count, created_at'),
    supabase.from('document_pages').select('id', { count: 'exact', head: true }),
  ])
  const numbers = dashboardNumbers(jobs ?? [], exports ?? [], new Date())

  // Retention: remove the originals of this user's long-untouched jobs.
  // Scheduled after the response so it never slows the page down.
  after(async () => {
    try {
      await purgeExpiredDocuments(supabase)
    } catch (err) {
      console.warn('Retention purge failed:', err instanceof Error ? err.message : err)
    }
  })

  const stats = [
    { label: 'Jobs in progress', value: numbers.inProgress, href: '/jobs' },
    { label: 'Waiting for review', value: numbers.waitingForReview, href: '/jobs' },
    { label: 'Pages read', value: pagesRead ?? 0 },
    { label: 'Records exported this month', value: numbers.recordsExportedThisMonth },
  ]

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium text-ink">Dashboard</h1>
          <p className="text-sm text-ink-muted mt-1">Turn timecards into a checked, completed Excel file in five steps.</p>
        </div>
        <Link href="/extraction/new" className="bg-brand text-white text-sm font-medium px-4 py-2 rounded-md">
          New extraction
        </Link>
      </div>

      <section aria-labelledby="glance" className="mt-6">
        <h2 id="glance" className="sr-only">At a glance</h2>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((s) => {
            const body = (
              <>
                <dt className="text-xs text-ink-muted">{s.label}</dt>
                <dd className="mt-1 text-2xl font-medium text-ink">{s.value.toLocaleString()}</dd>
              </>
            )
            return s.href ? (
              <Link key={s.label} href={s.href} className="rounded-lg border border-line bg-white px-4 py-3 hover:border-brand-blue">
                {body}
              </Link>
            ) : (
              <div key={s.label} className="rounded-lg border border-line bg-white px-4 py-3">
                {body}
              </div>
            )
          })}
        </dl>
        <Link href="/jobs" className="mt-2 inline-block text-sm text-brand-blue hover:underline">
          See all your jobs →
        </Link>
      </section>

      <section aria-labelledby="how" className="mt-8">
        <h2 id="how" className="text-base font-medium text-ink">How it works</h2>
        <ol className="mt-3 grid gap-3 md:grid-cols-5">
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative rounded-lg border border-line bg-surface p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-medium text-white">
                  {i + 1}
                </span>
                <step.icon size={18} className="text-brand-blue" aria-hidden />
              </div>
              <p className="mt-3 text-sm font-medium text-ink">{step.title}</p>
              <p className="mt-1 text-sm text-ink-muted">{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-ink-muted">
          Nothing reaches your Excel file until you have reviewed and approved it.
        </p>
      </section>

      <section aria-labelledby="tips" className="mt-8 rounded-lg border border-brand-blue bg-brand-blue-soft px-5 py-4">
        <h2 id="tips" className="text-base font-medium text-ink">Tips for good results</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
          {TIPS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
