import { notFound } from 'next/navigation'
import { getJobProgress, WIZARD_STEPS } from '@/lib/extraction/job-progress'
import { StepIndicator, StepNav } from '@/components/extraction/wizard-steps'
import { DeleteJobButton } from '@/components/extraction/delete-job-button'
import { daysUntilRemoval, removalDate, RETENTION_DAYS } from '@/lib/retention'

export default async function ExtractionJobLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ jobId: string }>
}) {
  const { jobId } = await params
  const progress = await getJobProgress(jobId)

  if (!progress) notFound()

  const { job, unlocked, completed } = progress
  // Step 3 unlocked means documents may exist; before that there is nothing to remove
  const daysLeft = unlocked[2] ? daysUntilRemoval(job.updated_at) : null

  return (
    <div>
      <div className="max-w-4xl flex items-start justify-between gap-4">
        <h1 className="text-2xl font-medium text-ink">{job.name}</h1>
        <DeleteJobButton jobId={job.id} jobName={job.name} redirectTo="/dashboard" />
      </div>

      <div className="mt-6 max-w-4xl">
        <StepIndicator jobId={job.id} steps={WIZARD_STEPS} unlocked={unlocked} completed={completed} />
      </div>
      <hr className="border-line my-6" />

      {daysLeft !== null && daysLeft <= 7 && (
        <p className="mb-5 max-w-4xl rounded-md border border-brand bg-brand-soft px-4 py-2 text-sm text-brand-strong">
          ⚠{' '}
          {daysLeft === 0
            ? `The original documents for this job are due to be removed: it has not been changed for ${RETENTION_DAYS} days.`
            : `The original documents for this job will be removed on ${removalDate(job.updated_at).toLocaleDateString()} (${RETENTION_DAYS} days after its last change).`}{' '}
          Your extracted data and Excel files are kept.
        </p>
      )}

      {children}

      <StepNav jobId={job.id} steps={WIZARD_STEPS} unlocked={unlocked} />
    </div>
  )
}
