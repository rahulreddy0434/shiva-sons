/** Job statuses that mean the work is finished. */
const FINISHED = new Set(['exported', 'completed'])

export interface DashboardNumbers {
  /** Jobs not yet exported. */
  inProgress: number
  /** Jobs whose records are waiting for someone to check them in Review. */
  waitingForReview: number
  /** Records written to Excel since the first of this month. */
  recordsExportedThisMonth: number
}

/**
 * The at-a-glance figures on the dashboard. `exports` are the generated
 * workbooks; a job exported twice counts its records twice, as it was sent twice.
 */
export function dashboardNumbers(
  jobs: { status: string }[],
  exports: { record_count: number | null; created_at: string }[],
  now: Date
): DashboardNumbers {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  return {
    inProgress: jobs.filter((j) => !FINISHED.has(j.status)).length,
    waitingForReview: jobs.filter((j) => j.status === 'needs_review').length,
    recordsExportedThisMonth: exports
      .filter((e) => new Date(e.created_at).getTime() >= monthStart)
      .reduce((sum, e) => sum + (e.record_count ?? 0), 0),
  }
}
