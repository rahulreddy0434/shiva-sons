import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { JobsTable } from '@/components/jobs/jobs-table'

const RECENT_JOBS = 5

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: jobs, count } = await supabase
    .from('extraction_jobs')
    .select('id, name, status, created_at, updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .limit(RECENT_JOBS)

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
        <div>
          <h1 className="text-2xl font-medium text-ink">Dashboard</h1>
          <p className="text-sm text-ink-muted mt-1">Your most recent extraction jobs.</p>
        </div>
        <Link href="/extraction/new" className="bg-brand text-white text-sm font-medium px-4 py-2 rounded-md">
          New extraction
        </Link>
      </div>
      <hr className="border-line my-5" />

      {!jobs || jobs.length === 0 ? (
        <p className="text-sm text-ink-muted">No jobs yet — create your first extraction to get started.</p>
      ) : (
        <>
          <JobsTable jobs={jobs} />
          {(count ?? 0) > jobs.length && (
            <Link href="/jobs" className="mt-4 inline-block text-sm text-brand-blue hover:underline">
              See all {count} jobs →
            </Link>
          )}
        </>
      )}
    </div>
  )
}
