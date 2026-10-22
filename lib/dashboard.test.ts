import { describe, expect, it } from 'vitest'
import { dashboardNumbers } from './dashboard'

describe('dashboardNumbers', () => {
  const now = new Date(2026, 9, 22, 12) // 22 October 2026, local time

  it('counts unfinished jobs and the ones waiting for review', () => {
    const jobs = [{ status: 'draft' }, { status: 'needs_review' }, { status: 'approved' }, { status: 'exported' }, { status: 'completed' }]
    expect(dashboardNumbers(jobs, [], now)).toMatchObject({ inProgress: 3, waitingForReview: 1 })
  })

  it('adds up the records exported since the first of this month only', () => {
    const exports = [
      { record_count: 8, created_at: new Date(2026, 9, 1, 0, 5).toISOString() },
      { record_count: 5, created_at: new Date(2026, 9, 20).toISOString() },
      { record_count: null, created_at: new Date(2026, 9, 21).toISOString() },
      { record_count: 40, created_at: new Date(2026, 8, 30, 23).toISOString() },
    ]
    expect(dashboardNumbers([], exports, now).recordsExportedThisMonth).toBe(13)
  })
})
