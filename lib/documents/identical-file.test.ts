import { describe, expect, it, vi } from 'vitest'
import { findIdenticalDocument, MAX_COMPARED } from './identical-file'

const files: Record<string, Buffer> = {
  'a.pdf': Buffer.from('card one'),
  'b.pdf': Buffer.from('card two'),
}
const read = async (path: string) => files[path] ?? null

describe('findIdenticalDocument', () => {
  it('finds the stored file with exactly the same bytes, whatever it is called', async () => {
    const found = await findIdenticalDocument(
      Buffer.from('card two'),
      [
        { name: 'Week 1.pdf', path: 'a.pdf' },
        { name: 'Week 2.pdf', path: 'b.pdf' },
      ],
      read
    )
    expect(found?.name).toBe('Week 2.pdf')
  })

  it('treats same-sized but different files, and unreadable ones, as different', async () => {
    const found = await findIdenticalDocument(
      Buffer.from('card six'),
      [
        { name: 'a', path: 'a.pdf' },
        { name: 'gone', path: 'missing.pdf' },
      ],
      read
    )
    expect(found).toBeNull()
  })

  it('reads at most a fixed number of files', async () => {
    const spy = vi.fn(async () => null)
    const many = Array.from({ length: MAX_COMPARED + 5 }, (_, i) => ({ name: `${i}`, path: `${i}` }))
    await findIdenticalDocument(Buffer.from('x'), many, spy)
    expect(spy).toHaveBeenCalledTimes(MAX_COMPARED)
  })
})
