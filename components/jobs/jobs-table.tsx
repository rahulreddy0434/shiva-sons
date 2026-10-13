import Link from 'next/link'
import { DeleteJobButton } from '@/components/extraction/delete-job-button'

export interface JobRow {
  id: string
  name: string
  status: string
  created_at: string
  updated_at: string
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'border-line text-ink-muted' },
  uploaded: { label: 'Uploaded', className: 'border-line text-ink-muted' },
  processing: { label: 'Processing', className: 'border-brand-blue text-brand-blue' },
  needs_review: { label: 'Needs review', className: 'border-brand text-brand-strong bg-brand-soft' },
  approved: { label: 'Approved', className: 'border-brand-blue text-brand-blue bg-brand-blue-soft' },
  exported: { label: 'Exported', className: 'border-success text-success' },
  failed: { label: 'Failed', className: 'border-danger text-danger' },
}

export function JobsTable({ jobs }: { jobs: JobRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-muted border-b border-line">
            <th className="pb-2 font-medium">Job</th>
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Last updated</th>
            <th className="pb-2 font-medium sr-only">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const status = STATUS_LABEL[job.status] ?? { label: job.status.replace(/_/g, ' '), className: 'border-line text-ink-muted' }
            return (
              <tr key={job.id} className="border-b border-line">
                <td className="py-3 pr-4">
                  <Link href={`/extraction/${job.id}`} className="text-ink hover:text-brand-blue hover:underline">
                    {job.name}
                  </Link>
                </td>
                <td className="py-3 pr-4">
                  <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${status.className}`}>
                    {status.label}
                  </span>
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">{new Date(job.updated_at ?? job.created_at).toLocaleDateString()}</td>
                <td className="py-3 text-right whitespace-nowrap">
                  <Link href={`/extraction/${job.id}`} className="text-xs text-brand-blue hover:underline mr-4">
                    Open
                  </Link>
                  <DeleteJobButton jobId={job.id} jobName={job.name} className="text-xs text-danger hover:underline" />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
