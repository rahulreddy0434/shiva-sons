'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function DeleteJobButton({
  jobId,
  jobName,
  redirectTo,
  className,
}: {
  jobId: string
  jobName: string
  /** Where to go once the job is gone. Omit to stay put and refresh the list. */
  redirectTo?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function close() {
    if (deleting) return
    setOpen(false)
    setError(null)
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)

    const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' })

    if (!res.ok) {
      const result = await res.json().catch(() => ({}))
      setError(result.error ?? 'Could not delete this job.')
      setDeleting(false)
      return
    }

    if (redirectTo) router.push(redirectTo)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? 'text-sm border border-[#B5522E] text-[#B5522E] rounded-md px-3 py-1.5'}
      >
        Delete
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1E2B3A]/40 p-4"
          onClick={close}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-job-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white border border-[#DADDD5] rounded-lg p-6 text-left"
          >
            <h2 id="delete-job-title" className="text-lg font-medium text-[#1E2B3A]">
              Delete this job?
            </h2>
            <p className="text-sm text-[#5B6B78] mt-2">
              <span className="text-[#1E2B3A] font-medium">{jobName}</span> will be permanently removed, along with
              its Excel template, uploaded documents, and everything extracted from them. This can&apos;t be undone.
            </p>
            {error && <p className="text-sm text-[#B5522E] mt-3">{error}</p>}
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={close}
                disabled={deleting}
                className="text-sm border border-[#DADDD5] rounded-md px-4 py-2 disabled:opacity-60"
              >
                Keep job
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="text-sm bg-[#B5522E] text-white font-medium rounded-md px-4 py-2 disabled:opacity-60"
              >
                {deleting ? 'Deleting…' : 'Delete job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
