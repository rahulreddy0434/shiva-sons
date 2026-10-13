import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { DeleteJobButton } from '@/components/extraction/delete-job-button'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: jobs } = await supabase
    .from('extraction_jobs')
    .select('id, name, status, created_at')
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="flex items-end justify-between mb-1">
        <div>
          <h1 className="text-2xl font-medium text-[#1E2B3A]">Dashboard</h1>
          <p className="text-sm text-[#5B6B78] mt-1">Your extraction jobs, at a glance.</p>
        </div>
        <Link href="/extraction/new" className="bg-[#A97C33] text-white text-sm font-medium px-4 py-2 rounded-md">
          New extraction
        </Link>
      </div>
      <hr className="border-[#DADDD5] my-5" />

      {!jobs || jobs.length === 0 ? (
        <p className="text-sm text-[#5B6B78]">No jobs yet — create your first extraction to get started.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[#5B6B78] border-b border-[#DADDD5]">
              <th className="pb-2 font-medium">Job</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Created</th>
              <th className="pb-2 font-medium sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(job => (
              <tr key={job.id} className="border-b border-[#DADDD5]">
                <td className="py-3">
                  <Link href={`/extraction/${job.id}`} className="text-[#1E2B3A] hover:text-[#A97C33] hover:underline">
                    {job.name}
                  </Link>
                </td>
                <td className="py-3 capitalize">{job.status}</td>
                <td className="py-3">{new Date(job.created_at).toLocaleDateString()}</td>
                <td className="py-3 text-right">
                  <DeleteJobButton
                    jobId={job.id}
                    jobName={job.name}
                    className="text-xs text-[#B5522E] hover:underline"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}