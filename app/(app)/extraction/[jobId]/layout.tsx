import { notFound } from 'next/navigation'
import { getJobProgress, WIZARD_STEPS } from '@/lib/extraction/job-progress'
import { StepIndicator, StepNav } from '@/components/extraction/wizard-steps'
import { DeleteJobButton } from '@/components/extraction/delete-job-button'

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

      {children}

      <StepNav jobId={job.id} steps={WIZARD_STEPS} unlocked={unlocked} />
    </div>
  )
}
