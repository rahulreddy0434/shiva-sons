import type { Metadata } from 'next'
import Link from 'next/link'
import { LEGAL } from '@/lib/legal'
import { LegalValue } from '@/components/legal-placeholder'
import { RETENTION_DAYS } from '@/lib/retention'

export const metadata: Metadata = { title: 'Privacy — Shiva Sons Technologies' }

const H2 = 'mt-10 text-lg font-medium text-ink'
const P = 'mt-2 text-ink-muted'
const UL = 'mt-2 list-disc space-y-1 pl-5 text-ink-muted'

export default function PrivacyPage() {
  const contact = <LegalValue value={LEGAL.contactEmail} missing="contact email to be added" />
  return (
    <article className="mx-auto max-w-3xl px-5 py-14 text-sm leading-6 text-ink">
      <h1 className="text-3xl font-semibold">Privacy policy</h1>
      <p className="mt-2 text-ink-muted">Effective {LEGAL.effectiveDate}</p>

      <p className="mt-6 text-ink-muted">
        This policy explains what {LEGAL.businessName} (“we”) collects when you use our timecard-to-Excel service, why,
        who else handles it, how long it is kept and the choices you have. It applies to everyone who uses the service,
        including in {LEGAL.regions.slice(0, -1).join(', ')} and {LEGAL.regions[LEGAL.regions.length - 1]}.
      </p>

      <h2 className={H2}>1. Who is responsible for what</h2>
      <ul className={UL}>
        <li>
          <span className="text-ink">Your account details</span> (your email address and sign-in): we decide how these
          are used, and we are responsible for them.
        </li>
        <li>
          <span className="text-ink">What you upload</span> (timecards, Excel workbooks, and the names, ID numbers and
          hours on them): you, or the business you work for, decide what is processed and why. We process it only to
          provide the service to you, on your instructions. You are responsible for having the right to upload it and
          for telling the people on the timecards how their information is used, as the law where you operate requires.
        </li>
      </ul>

      <h2 className={H2}>2. What we collect</h2>
      <ul className={UL}>
        <li>Your email address, and a scrambled (hashed) form of your password, which we cannot read.</li>
        <li>
          The documents and Excel workbooks you upload, the text read from the documents, the values extracted from
          them, your instructions, your corrections and approvals, and the Excel files we make for you.
        </li>
        <li>
          Basic technical records: when you signed in, how many documents you processed (to keep usage within limits),
          and error reports when something breaks. Error reports leave out the content of your documents, your email
          address, cookies and the data you typed.
        </li>
      </ul>
      <p className={P}>
        We do not use advertising or analytics trackers. The only cookies are the ones that keep you signed in.
      </p>

      <h2 className={H2}>3. How we use it</h2>
      <ul className={UL}>
        <li>To provide the service: read your documents, extract the values, show them to you for review, and fill your Excel template.</li>
        <li>To run your account: sign-in, password reset, and emails about your account.</li>
        <li>To keep the service secure and working: preventing misuse, enforcing usage limits, and fixing errors.</li>
        <li>To meet legal obligations.</li>
      </ul>
      <p className={P}>
        We do not sell your information, and we do not use your documents or their contents to train our own AI models.
      </p>

      <h2 className={H2}>4. Who else handles it</h2>
      <p className={P}>We use these service providers. Each receives only what it needs for its part.</p>
      <ul className={UL}>
        <li><span className="text-ink">Supabase</span>: database, file storage and sign-in. All your data is stored here.</li>
        <li><span className="text-ink">Microsoft Azure AI Document Intelligence</span>: reads the text on the documents you upload.</li>
        <li>
          <span className="text-ink">Google (Gemini API)</span>: receives the text read from a document, your instructions
          and your column headings, and returns the extracted values. While we use Google’s free tier, Google may use what
          is sent to it to improve its products, and people at Google may review it. When we move to Google’s paid tier,
          which does not allow this, we will update this policy.
        </li>
        <li><span className="text-ink">Vercel</span>: hosts the website and runs the processing.</li>
        <li><span className="text-ink">Sentry</span>: receives error reports, with the details listed in section 2 removed.</li>
        <li><span className="text-ink">Our email provider</span>: sends sign-up confirmation and password-reset emails.</li>
      </ul>
      <p className={P}>
        These providers may store or process information outside your country, including in the United States and the
        European Union. We choose providers that protect it with security measures and contractual commitments, and
        we may also share information if the law requires it.
      </p>

      <h2 className={H2}>5. How long we keep it</h2>
      <ul className={UL}>
        <li>
          Original documents, and the text read from them, are deleted automatically {RETENTION_DAYS} days after the job
          they belong to was last changed.
        </li>
        <li>Extracted values, corrections, Excel templates and generated Excel files are kept until you delete the job.</li>
        <li>Deleting a job removes everything in it straight away.</li>
        <li>
          Deleting your account, in Settings, removes all your jobs and files and your sign-in. Copies in backups, where
          our providers keep them, are overwritten within 30 days.
        </li>
      </ul>

      <h2 className={H2}>6. How we protect it</h2>
      <p className={P}>
        Information is encrypted in transit, files are stored privately, and every account can reach only its own jobs,
        documents and results; the database itself enforces this. Download links expire shortly after they are made,
        and access to the systems behind the service is limited to the people who run it. If a breach puts your
        information at risk, we will tell you and the authorities as the law requires.
      </p>

      <h2 className={H2}>7. Your choices and rights</h2>
      <p className={P}>
        You can see, correct and delete your data at any time in the app: edit values in Review, delete jobs, and delete
        your account in Settings. You can also write to us at {contact} to ask for a copy of your information, to have it
        corrected or deleted, or to withdraw consent. We will answer within 30 days. If the information is about you
        because your employer uploaded your timecard, please contact your employer first; we will help them answer you.
      </p>
      <ul className={UL}>
        <li>
          <span className="text-ink">United Arab Emirates</span>: you have the rights given by the Personal Data
          Protection Law (Federal Decree-Law No. 45 of 2021), including access, correction, deletion and objection, and
          you may complain to the UAE Data Office. Different rules apply in free zones such as DIFC and ADGM.
        </li>
        <li>
          <span className="text-ink">India</span>: you have the rights given by the Digital Personal Data Protection Act,
          2023, including access, correction, erasure, nominating someone to act for you, and complaint to the Data
          Protection Board of India once you have raised it with us.
        </li>
        <li>
          <span className="text-ink">Canada</span>: you have the rights given by PIPEDA and provincial privacy laws,
          including access and correction, and you may complain to the Office of the Privacy Commissioner of Canada or
          your provincial commissioner.
        </li>
      </ul>

      <h2 className={H2}>8. Children</h2>
      <p className={P}>The service is for businesses and is not meant for anyone under 18.</p>

      <h2 className={H2}>9. Changes to this policy</h2>
      <p className={P}>
        If we change this policy, we will update the date at the top, and tell you by email or in the app before an
        important change takes effect.
      </p>

      <h2 className={H2}>10. Contact</h2>
      <p className={P}>
        {LEGAL.businessName}, <LegalValue value={LEGAL.address} missing="business address to be added" />. Email: {contact}.
        See also our <Link href="/terms" className="text-brand-blue hover:underline">Terms of use</Link>.
      </p>
    </article>
  )
}
