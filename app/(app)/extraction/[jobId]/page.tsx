import { notFound, redirect } from 'next/navigation'
import { getJobProgress } from '@/lib/extraction/job-progress'

export default async function ExtractionJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>
}) {
  const { jobId } = await params
  const progress = await getJobProgress(jobId)

  if (!progress) notFound()

  redirect(`/extraction/${jobId}/${progress.resumeStep}`)
}
