import { describe, expect, it } from 'vitest'
import { destinationFor, isLinkType, linkProblem, safeNextPath } from './confirm-link'

describe('safeNextPath', () => {
  it('keeps paths on this site', () => {
    expect(safeNextPath('/dashboard')).toBe('/dashboard')
    expect(safeNextPath('/extraction/new?x=1')).toBe('/extraction/new?x=1')
  })

  it('refuses anything that could lead to another website', () => {
    for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', 'dashboard', '', null])
      expect(safeNextPath(next), String(next)).toBeNull()
  })
})

describe('destinationFor', () => {
  it('opens the new-password form after a reset link, whatever next says', () => {
    expect(destinationFor('recovery', '/dashboard')).toBe('/reset-password?step=new')
  })

  it('welcomes a newly confirmed account on the dashboard', () => {
    expect(destinationFor('signup', null)).toBe('/dashboard?confirmed=1')
    expect(destinationFor('email', 'https://evil.example')).toBe('/dashboard?confirmed=1')
    expect(destinationFor('email', '/jobs')).toBe('/jobs')
  })

  it('confirms a changed email address in Settings', () => {
    expect(destinationFor('email_change', null)).toBe('/settings?email=changed')
  })
})

describe('isLinkType and linkProblem', () => {
  it('accepts only the link kinds Supabase sends', () => {
    expect(isLinkType('recovery')).toBe(true)
    expect(isLinkType('sms')).toBe(false)
    expect(isLinkType(null)).toBe(false)
  })

  it('tells an expired or used link from a broken one', () => {
    expect(linkProblem('Email link is invalid or has expired')).toBe('expired')
    expect(linkProblem('Token has expired or is invalid')).toBe('expired')
    expect(linkProblem('something else')).toBe('invalid')
  })
})
