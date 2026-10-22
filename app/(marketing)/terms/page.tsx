import type { Metadata } from 'next'
import Link from 'next/link'
import { LEGAL } from '@/lib/legal'
import { LegalValue } from '@/components/legal-placeholder'
import { RETENTION_DAYS } from '@/lib/retention'

export const metadata: Metadata = { title: 'Terms — Shiva Sons Technologies' }

const H2 = 'mt-10 text-lg font-medium text-ink'
const P = 'mt-2 text-ink-muted'
const UL = 'mt-2 list-disc space-y-1 pl-5 text-ink-muted'

export default function TermsPage() {
  const name = LEGAL.businessName
  const contact = <LegalValue value={LEGAL.contactEmail} missing="contact email to be added" />
  return (
    <article className="mx-auto max-w-3xl px-5 py-14 text-sm leading-6 text-ink">
      <h1 className="text-3xl font-semibold">Terms of use</h1>
      <p className="mt-2 text-ink-muted">Effective {LEGAL.effectiveDate}</p>

      <p className="mt-6 text-ink-muted">
        These terms are an agreement between you and {name} (“we”) for the use of our timecard-to-Excel service. By
        creating an account or using the service you accept them. If you use it for a business, you accept them for
        that business and confirm you are allowed to. Our{' '}
        <Link href="/privacy" className="text-brand-blue hover:underline">Privacy policy</Link> explains how we handle data.
      </p>

      <h2 className={H2}>1. The service</h2>
      <p className={P}>
        The service reads timecards and similar documents you upload, extracts the values you ask for, shows them to
        you beside the original for review, and, once you approve them, writes them into your own Excel workbook. It is
        in early access: features may change, and it may sometimes be unavailable. It is currently free of charge. If
        we introduce paid plans we will tell you in advance, and you can choose whether to continue.
      </p>

      <h2 className={H2}>2. Your account</h2>
      <ul className={UL}>
        <li>You must be at least 18 and give a working email address you control.</li>
        <li>Keep your password private. You are responsible for what happens under your account.</li>
        <li>Tell us straight away at {contact} if you think someone else has used it.</li>
      </ul>

      <h2 className={H2}>3. You check the results</h2>
      <p className={P}>
        Values are read automatically and can be wrong, especially from handwriting, faint scans or photos. The service
        flags values it is unsure of, but it cannot catch every mistake. You must check every record against the
        original document before approving it, and you are responsible for the approved data and for how you use the
        Excel file, including for payroll, invoices or anything else that affects other people. Nothing is written to
        your workbook until you approve it.
      </p>

      <h2 className={H2}>4. Your documents and data</h2>
      <ul className={UL}>
        <li>You keep all rights to what you upload and to the Excel files we make for you.</li>
        <li>
          You give us permission to store and process it only to provide the service to you, including through the
          providers listed in the Privacy policy.
        </li>
        <li>
          You confirm you have the right to upload it, including any personal information about employees or
          contractors, and that you have told them how it is used, as the law where you operate requires.
        </li>
        <li>
          Original documents are deleted automatically {RETENTION_DAYS} days after their job was last changed. Keep your own copies. You can delete jobs, or your
          whole account, at any time.
        </li>
      </ul>

      <h2 className={H2}>5. Acceptable use</h2>
      <p className={P}>You must not:</p>
      <ul className={UL}>
        <li>upload anything you have no right to, or anything unlawful;</li>
        <li>try to reach another customer’s data, or get around the service’s security or usage limits;</li>
        <li>overload the service, or use automated tools to access it other than through the app;</li>
        <li>copy, resell or reverse-engineer the service.</li>
      </ul>
      <p className={P}>We may suspend an account that breaks these rules, and will tell you why where we can.</p>

      <h2 className={H2}>6. Our service and other services</h2>
      <p className={P}>
        The software, design and brand of the service belong to us. The service relies on providers such as Supabase,
        Microsoft Azure and Google; we are not responsible for their own outages, but we will work to limit any effect
        on you.
      </p>

      <h2 className={H2}>7. Ending the agreement</h2>
      <p className={P}>
        You can stop at any time by deleting your account in Settings, which deletes your data as the Privacy policy
        describes. We may end the service, or your access, with reasonable notice by email, or straight away for a
        serious breach of these terms. Sections 3, 4, 8 and 9 continue after the agreement ends.
      </p>

      <h2 className={H2}>8. Warranties and liability</h2>
      <p className={P}>
        The service is provided “as is” and “as available”. To the extent the law allows, we make no promise that it
        will be uninterrupted, error-free, or that extracted values will be accurate, and we are not liable for
        indirect or consequential losses such as lost profits, or for losses caused by data you approved. Our total
        liability for any claim is limited to the amount you paid us in the 12 months before it, or USD 100 if you paid
        nothing. Nothing in these terms limits rights you have under consumer or other laws that cannot be excluded.
      </p>

      <h2 className={H2}>9. Governing law and disputes</h2>
      <p className={P}>
        These terms are governed by the laws of{' '}
        <LegalValue value={LEGAL.governingLaw} missing="country of registration to be added" />. Before going to court,
        please contact us so we can try to resolve the matter; if that fails within 60 days, either side may take it to
        the courts of that place. If you are a consumer, you keep any right to bring a claim where you live.
      </p>

      <h2 className={H2}>10. Changes to these terms</h2>
      <p className={P}>
        We may update these terms as the service develops. We will update the date at the top, and tell you by email or
        in the app at least 14 days before an important change takes effect. If you keep using the service after that,
        the new terms apply.
      </p>

      <h2 className={H2}>11. Contact</h2>
      <p className={P}>
        {name}, <LegalValue value={LEGAL.address} missing="business address to be added" />. Email: {contact}.
      </p>
    </article>
  )
}
