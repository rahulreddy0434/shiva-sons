import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { JobsTable } from '@/components/jobs/jobs-table'

export default async function JobsPage() {
  const supabase = await createClient()
  const { data: jobs } = await supabase
    .from('extraction_jobs')
    .select('id, name, status, created_at, updated_at')
    .order('updated_at', { ascending: false })

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
        <div>
          <h1 className="text-2xl font-medium text-ink">Jobs</h1>
          <p className="text-sm text-ink-muted mt-1">Every extraction job in your account. Open one to pick up where you left off.</p>
        </div>
        <Link href="/extraction/new" className="bg-brand text-white text-sm font-medium px-4 py-2 rounded-md">
          New extraction
        </Link>
      </div>
      <hr className="border-line my-5" />

      {!jobs || jobs.length === 0 ? (
        <p className="text-sm text-ink-muted">No jobs yet — create your first extraction to get started.</p>
      ) : (
        <JobsTable jobs={jobs} />
      )}
    </div>
  )
}
