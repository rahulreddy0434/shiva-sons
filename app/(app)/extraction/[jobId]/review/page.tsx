import { requireStep } from '@/lib/extraction/job-progress'

export default async function ReviewStepPage({
  params,
}: {
  params: Promise<{ jobId: string }>
}) {
  const { jobId } = await params
  await requireStep(jobId, 'review')

  return (
    <div>
      <p className="text-sm text-[#5B6B78] mb-4">Step 4 of 5 — Review</p>
      <p className="text-sm text-[#5B6B78]">Coming in a later phase.</p>
    </div>
  )
}
