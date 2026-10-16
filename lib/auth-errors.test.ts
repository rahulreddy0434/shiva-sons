import { describe, expect, it } from 'vitest'
import { friendlyAuthError } from './auth-errors'

describe('friendlyAuthError', () => {
  it('explains the email rate limit in plain words', () => {
    expect(friendlyAuthError('email rate limit exceeded')).toMatch(/could not send the email just now/)
  })

  it('rewords the messages people meet when signing in and up', () => {
    expect(friendlyAuthError('Invalid login credentials')).toBe('That email and password do not match an account.')
    expect(friendlyAuthError('Email not confirmed')).toMatch(/confirm your email first/)
    expect(friendlyAuthError('User already registered')).toMatch(/already exists/)
  })

  it('shows any other message as it is', () => {
    expect(friendlyAuthError('Password should be at least 6 characters.')).toBe('Password should be at least 6 characters.')
  })
})
