import { requireStep } from '@/lib/extraction/job-progress'

export default async function ExportStepPage({
  params,
}: {
  params: Promise<{ jobId: string }>
}) {
  const { jobId } = await params
  await requireStep(jobId, 'export')

  return (
    <div>
      <p className="text-sm text-[#5B6B78] mb-4">Step 5 of 5 — Export</p>
      <p className="text-sm text-[#5B6B78]">Coming in a later phase.</p>
    </div>
  )
}
