import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const WIZARD_STEPS = [
  { slug: 'template', label: 'Excel template' },
  { slug: 'instructions', label: 'Instructions' },
  { slug: 'documents', label: 'Documents' },
  { slug: 'review', label: 'Review' },
  { slug: 'export', label: 'Approve & export' },
] as const

export type StepSlug = (typeof WIZARD_STEPS)[number]['slug']

export interface JobProgress {
  job: { id: string; name: string }
  /** One entry per wizard step, in order. */
  unlocked: boolean[]
  completed: boolean[]
  /** Where the bare /extraction/[jobId] route should land. */
  resumeStep: StepSlug
}

/**
 * Loads the job and works out which wizard steps are reachable. Wrapped in
 * cache() so the layout and the page under it share one set of queries per
 * request.
 */
export const getJobProgress = cache(async (jobId: string): Promise<JobProgress | null> => {
  const supabase = await createClient()

  const { data: job } = await supabase
    .from('extraction_jobs')
    .select('id, name')
    .eq('id', jobId)
    .maybeSingle()

  if (!job) return null

  const [workbook, approvedSchema, records] = await Promise.all([
    supabase.from('workbook_files').select('id', { count: 'exact', head: true }).eq('job_id', jobId),
    supabase
      .from('extraction_schemas')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId)
      .eq('approved', true),
    supabase.from('extraction_records').select('id', { count: 'exact', head: true }).eq('job_id', jobId),
  ])

  const hasWorkbook = (workbook.count ?? 0) > 0
  const schemaApproved = hasWorkbook && (approvedSchema.count ?? 0) > 0
  const hasRecords = schemaApproved && (records.count ?? 0) > 0

  const unlocked = [true, hasWorkbook, schemaApproved, hasRecords, hasRecords]
  // Review and Export have no "finished" state until Phases 8–9 build them.
  const completed = [hasWorkbook, schemaApproved, hasRecords, false, false]

  // Review and Export unlock together, so "furthest" stops at Review rather
  // than skipping straight past it.
  const resumeStep: StepSlug = hasRecords
    ? 'review'
    : schemaApproved
      ? 'documents'
      : hasWorkbook
        ? 'instructions'
        : 'template'

  return { job, unlocked, completed, resumeStep }
})

/**
 * Guard for a step page: 404s on an unknown job, and bounces a visit to a
 * still-locked step back to the furthest step the job has reached.
 */
export async function requireStep(jobId: string, step: StepSlug): Promise<JobProgress> {
  const progress = await getJobProgress(jobId)
  if (!progress) notFound()

  if (!progress.unlocked[WIZARD_STEPS.findIndex((s) => s.slug === step)]) {
    redirect(`/extraction/${jobId}/${progress.resumeStep}`)
  }

  return progress
}
