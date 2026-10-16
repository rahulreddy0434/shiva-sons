import { describe, expect, it, vi } from 'vitest'
import { serverError } from './api-error'

describe('serverError', () => {
  it('answers 500 with the plain message and logs the database detail instead of showing it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = serverError('Could not save the value', { message: 'duplicate key value violates unique constraint' })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Could not save the value. Please try again.' })
    expect(log).toHaveBeenCalledWith('Could not save the value:', 'duplicate key value violates unique constraint')
    log.mockRestore()
  })
})
