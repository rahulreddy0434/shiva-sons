import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Privacy — Shiva Sons Technologies' }

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-14 text-sm leading-6 text-ink">
      <p className="rounded-md border border-brand bg-brand-soft px-4 py-3 text-brand-strong">
        Initial draft. This page describes how the product handles data today. It has not been reviewed by a lawyer and
        is not a statement of compliance with any privacy law.
      </p>

      <h1 className="mt-8 text-3xl font-semibold">Privacy</h1>

      <h2 className="mt-8 text-lg font-medium">What we store</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
        <li>Your account email address.</li>
        <li>The Excel workbooks and timecards you upload, and the workbooks generated for you.</li>
        <li>The text read from your documents, the extracted values, and the corrections you make.</li>
      </ul>

      <h2 className="mt-8 text-lg font-medium">Who can see it</h2>
      <p className="mt-2 text-ink-muted">
        Files are stored privately and each account can reach only its own jobs, documents and results. Links to view
        or download a file expire shortly after they are created.
      </p>

      <h2 className="mt-8 text-lg font-medium">Services that process your documents</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
        <li>Supabase — database, file storage and sign-in.</li>
        <li>Microsoft Azure AI Document Intelligence — reads the text on the documents you upload.</li>
        <li>
          Google Gemini — receives the text read from a document, your instructions and your column headings, and
          returns structured values.
        </li>
      </ul>
      <p className="mt-2 text-ink-muted">
        Each provider handles data under its own terms. Timecards usually contain personal information about
        employees; upload them only if you are entitled to.
      </p>

      <h2 className="mt-8 text-lg font-medium">How long we keep it</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
        <li>
          The original documents you upload, and the text read from them, are removed automatically 30 days after
          the job they belong to was last changed. This happens the next time you open your dashboard after that point.
        </li>
        <li>Extracted values, your corrections, Excel templates and generated Excel files are kept until you delete the job.</li>
        <li>Deleting a job removes everything in it immediately.</li>
        <li>Deleting your account, from Settings, removes every job and file and closes the sign-in.</li>
      </ul>

      <h2 className="mt-8 text-lg font-medium">Questions</h2>
      <p className="mt-2 text-ink-muted">Contact Shiva Sons Technologies using the details you were given when you signed up.</p>
    </article>
  )
}
