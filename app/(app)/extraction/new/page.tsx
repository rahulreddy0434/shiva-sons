import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const MAX_NAME_LENGTH = 120

async function createJob(formData: FormData) {
  'use server'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const name = String(formData.get('name') ?? '').trim().slice(0, MAX_NAME_LENGTH)
  if (!name) redirect('/extraction/new?error=name')

  const { data: job, error } = await supabase
    .from('extraction_jobs')
    .insert({ user_id: user.id, name, status: 'draft' })
    .select('id')
    .single()

  if (error || !job) {
    throw new Error(error?.message ?? 'Could not create a new extraction job')
  }

  redirect(`/extraction/${job.id}`)
}

export default async function NewExtractionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-medium text-ink">New extraction</h1>
      <p className="text-sm text-ink-muted mt-1">
        Give this job a name you&apos;ll recognise later. You can upload the Excel template and timecards in the next steps.
      </p>
      <hr className="border-line my-5" />

      <form action={createJob}>
        <label htmlFor="job-name" className="block text-sm font-medium mb-1">Job name</label>
        <input
          id="job-name"
          name="name"
          type="text"
          required
          maxLength={MAX_NAME_LENGTH}
          placeholder="e.g. October payroll"
          className="w-full border border-line rounded-md px-3 py-2 text-sm"
        />
        {error === 'name' && <p className="text-sm text-danger mt-2">Please enter a name for this job.</p>}

        <div className="flex items-center gap-3 mt-5">
          <button type="submit" className="bg-brand text-white text-sm font-medium rounded-md px-4 py-2">
            Create job
          </button>
          <Link href="/dashboard" className="text-sm text-ink-muted hover:text-ink">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
