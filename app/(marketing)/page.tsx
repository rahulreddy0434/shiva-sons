import Link from 'next/link'

const STEPS = [
  {
    title: 'Upload your Excel workbook',
    body: 'Use the spreadsheet you already keep. We read its worksheets and column headings so the results go where you expect.',
  },
  {
    title: 'Say what you need',
    body: 'Describe the fields in plain English, or start from the columns in your workbook. You confirm the field list before anything is read.',
  },
  {
    title: 'Upload your timecards',
    body: 'Add PDF, JPG or PNG timecards — several at once. Every page of every file is read, not just the first.',
  },
  {
    title: 'Review side by side',
    body: 'Each result is shown next to the original document. Anything missing, unclear or badly formatted is flagged for you to check and correct.',
  },
  {
    title: 'Approve and download',
    body: 'Nothing is exported until you approve it. Then download your workbook with the reviewed records filled in.',
  },
]

const FEATURES = [
  {
    title: 'You stay in control',
    body: 'The app never treats an uncertain value as correct. You see it, fix it or confirm it, and approve the result yourself.',
  },
  {
    title: 'Works with your spreadsheet',
    body: 'Records are added below the rows you already have. Formulas and cells outside the matched columns are left alone.',
  },
  {
    title: 'Handwritten or printed',
    body: 'Timecards are read with document-reading AI. Handwriting is harder than print, which is why every value can be checked against the page.',
  },
  {
    title: 'Corrections are kept',
    body: 'Your edits are saved as you go, with the original reading kept alongside, so you can stop and pick a job up again later.',
  },
  {
    title: 'Private by default',
    body: 'Your documents and workbooks are stored privately and are visible only to your account. You can delete a job and its files at any time.',
  },
  {
    title: 'Built for timecards first',
    body: 'Daily hours, employee details, monthly day-by-day sheets. Other document types may follow once timecards work well.',
  },
]

export default function HomePage() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-5 py-16 md:py-24">
        <p className="text-sm font-medium text-brand-strong">Timecards to Excel</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight text-ink md:text-5xl">
          Turn timecards into Excel data you have checked yourself.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-muted">
          Stop retyping timecards into spreadsheets. Upload them, review every result beside the original document, and
          approve before anything is exported.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link href="/sign-up" className="bg-brand text-white font-medium rounded-md px-6 py-3">
            Create an account
          </Link>
          <Link href="/sign-in" className="text-brand-blue font-medium hover:underline">
            Log in
          </Link>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-16">
          <h2 className="text-2xl font-semibold text-ink">How it works</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-lg border border-line bg-white p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-medium text-white">
                  {index + 1}
                </span>
                <h3 className="mt-3 text-base font-medium text-ink">{step.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-5xl px-5 py-16">
        <h2 className="text-2xl font-semibold text-ink">What you get</h2>
        <ul className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="border-l-2 border-brand-blue pl-4">
              <h3 className="text-base font-medium text-ink">{feature.title}</h3>
              <p className="mt-1 text-sm text-ink-muted">{feature.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-line bg-brand-soft">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-12">
          <div>
            <h2 className="text-xl font-semibold text-ink">Try it with one of your own timecards</h2>
            <p className="mt-1 text-sm text-ink-muted">
              The product is in early access. Results should always be reviewed before they are used for payroll.
            </p>
          </div>
          <Link href="/sign-up" className="bg-brand text-white font-medium rounded-md px-6 py-3">
            Create an account
          </Link>
        </div>
      </section>
    </>
  )
}
