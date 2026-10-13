import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ChangePasswordForm } from '@/components/settings/change-password-form'
import { DeleteAccountForm } from '@/components/settings/delete-account-form'
import { RETENTION_DAYS } from '@/lib/retention'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-medium text-ink">Settings</h1>
      <hr className="border-line my-5" />

      <section>
        <h2 className="text-base font-medium text-ink">Account</h2>
        <dl className="mt-3 text-sm">
          <dt className="text-ink-muted">Email</dt>
          <dd className="text-ink break-all">{user?.email}</dd>
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-medium text-ink mb-3">Password</h2>
        <ChangePasswordForm />
      </section>

      <section className="mt-8">
        <h2 className="text-base font-medium text-ink">Your data</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>
            The original documents you upload, and the text read from them, are removed automatically{' '}
            {RETENTION_DAYS} days after a job was last changed.
          </li>
          <li>Your extracted data, Excel templates and generated Excel files are kept until you delete the job.</li>
          <li>
            Deleting a job from the <Link href="/jobs" className="text-brand-blue hover:underline">Jobs</Link> page
            removes everything in it straight away.
          </li>
        </ul>
        <p className="mt-2 text-sm text-ink-muted">
          See the <Link href="/privacy" className="text-brand-blue hover:underline">privacy page</Link> for details.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-medium text-ink mb-3">Delete account</h2>
        {user?.email && <DeleteAccountForm email={user.email} />}
      </section>
    </div>
  )
}
