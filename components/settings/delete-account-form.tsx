'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function DeleteAccountForm({ email }: { email: string }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const matches = typed.trim().toLowerCase() === email.toLowerCase()

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault()
    if (!matches) return
    setDeleting(true)
    setError(null)

    const res = await fetch('/api/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmEmail: typed }),
    })

    if (!res.ok) {
      const result = await res.json().catch(() => ({}))
      setError(result.error ?? 'The account could not be deleted. Please try again.')
      setDeleting(false)
      return
    }
    router.push('/')
    router.refresh()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm border border-danger text-danger rounded-md px-4 py-2"
      >
        Delete my account…
      </button>
    )
  }

  return (
    <form onSubmit={handleDelete} className="max-w-sm border border-danger rounded-lg p-4">
      <p className="text-sm text-ink">
        This permanently deletes your account, every job, every uploaded document and workbook, and every generated
        file. It can&apos;t be undone.
      </p>
      <label htmlFor="confirm-email" className="block text-sm font-medium mt-3 mb-1">
        Type <span className="break-all">{email}</span> to confirm
      </label>
      <input
        id="confirm-email"
        type="email"
        autoComplete="off"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        className="w-full border border-line rounded-md px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-danger mt-2">✕ {error}</p>}
      <div className="flex items-center gap-3 mt-4">
        <button
          type="submit"
          disabled={!matches || deleting}
          className="bg-danger text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete everything'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setTyped('')
            setError(null)
          }}
          disabled={deleting}
          className="text-sm border border-line rounded-md px-4 py-2 disabled:opacity-50"
        >
          Keep my account
        </button>
      </div>
    </form>
  )
}
