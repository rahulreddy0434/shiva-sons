import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ChangePasswordForm } from '@/components/settings/change-password-form'

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
        <p className="mt-2 text-sm text-ink-muted">
          Jobs and their files are kept until you delete them. Deleting a job from the{' '}
          <Link href="/jobs" className="text-brand-blue hover:underline">Jobs</Link> page removes its uploaded
          documents, workbooks, generated files and all extracted data. See the{' '}
          <Link href="/privacy" className="text-brand-blue hover:underline">privacy page</Link> for details.
        </p>
      </section>
    </div>
  )
}
