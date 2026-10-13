import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Terms — Shiva Sons Technologies' }

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-14 text-sm leading-6 text-ink">
      <p className="rounded-md border border-brand bg-brand-soft px-4 py-3 text-brand-strong">
        Initial draft. These terms are a placeholder for early access and have not been reviewed by a lawyer.
      </p>

      <h1 className="mt-8 text-3xl font-semibold">Terms of use</h1>

      <h2 className="mt-8 text-lg font-medium">The service</h2>
      <p className="mt-2 text-ink-muted">
        Shiva Sons Technologies provides a tool that reads timecards and helps you transfer the information into your
        own Excel workbook. The service is in early access and may change or be unavailable at times.
      </p>

      <h2 className="mt-8 text-lg font-medium">You review the results</h2>
      <p className="mt-2 text-ink-muted">
        Values are read automatically and can be wrong, especially for handwriting. You are responsible for checking
        each result against the original document before approving it, and for how the exported workbook is used,
        including for payroll. We make no promise of a particular accuracy.
      </p>

      <h2 className="mt-8 text-lg font-medium">Your documents</h2>
      <p className="mt-2 text-ink-muted">
        You keep ownership of everything you upload. You confirm that you are entitled to upload it, including any
        personal information about your employees. You can delete your jobs and their files at any time.
      </p>

      <h2 className="mt-8 text-lg font-medium">Acceptable use</h2>
      <p className="mt-2 text-ink-muted">
        Do not use the service to process documents you have no right to, to attempt to reach another customer’s data,
        or to overload the service.
      </p>

      <h2 className="mt-8 text-lg font-medium">Changes</h2>
      <p className="mt-2 text-ink-muted">These terms will be replaced by a reviewed version before the service leaves early access.</p>
    </article>
  )
}
