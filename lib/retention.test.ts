import { describe, expect, it } from 'vitest'
import { daysUntilRemoval, isPastRetention, removalDate, RETENTION_DAYS, retentionNotice } from './retention'

const changed = '2026-10-01T12:00:00.000Z'

describe('retention dates', () => {
  it('schedules removal a fixed number of days after the last change', () => {
    expect(RETENTION_DAYS).toBe(30)
    expect(removalDate(changed).toISOString()).toBe('2026-10-31T12:00:00.000Z')
  })

  it('is not past retention until the removal moment', () => {
    expect(isPastRetention(changed, new Date('2026-10-31T11:59:59.000Z'))).toBe(false)
    expect(isPastRetention(changed, new Date('2026-10-31T12:00:00.000Z'))).toBe(true)
    expect(isPastRetention(changed, new Date('2027-01-01T00:00:00.000Z'))).toBe(true)
  })

  it('counts whole days remaining, rounding up and stopping at zero', () => {
    expect(daysUntilRemoval(changed, new Date('2026-10-01T12:00:00.000Z'))).toBe(30)
    expect(daysUntilRemoval(changed, new Date('2026-10-30T13:00:00.000Z'))).toBe(1)
    expect(daysUntilRemoval(changed, new Date('2026-10-31T12:00:00.000Z'))).toBe(0)
    expect(daysUntilRemoval(changed, new Date('2026-12-01T00:00:00.000Z'))).toBe(0)
  })

  it('restarts the clock when the job changes again', () => {
    const later = '2026-10-20T12:00:00.000Z'
    expect(isPastRetention(later, new Date('2026-11-05T00:00:00.000Z'))).toBe(false)
  })
})

describe('retentionNotice', () => {
  const kept = { purged_at: null }
  const gone = { purged_at: '2026-11-01T00:00:00.000Z' }

  it('says nothing for a job without documents or far from removal', () => {
    expect(retentionNotice([], changed, new Date('2026-12-01T00:00:00.000Z'))).toBeNull()
    expect(retentionNotice([kept], changed, new Date('2026-10-05T00:00:00.000Z'))).toBeNull()
  })

  it('warns in the last week with the removal date', () => {
    expect(retentionNotice([kept], changed, new Date('2026-10-26T00:00:00.000Z'))).toEqual({
      kind: 'soon',
      on: new Date('2026-10-31T12:00:00.000Z'),
    })
  })

  it('says removal is due once the date has passed but files remain', () => {
    expect(retentionNotice([kept, gone], changed, new Date('2026-11-02T00:00:00.000Z'))).toEqual({ kind: 'due' })
  })

  it('says the originals were removed once every one has been', () => {
    expect(retentionNotice([gone, gone], changed, new Date('2026-11-02T00:00:00.000Z'))).toEqual({ kind: 'removed' })
  })
})
