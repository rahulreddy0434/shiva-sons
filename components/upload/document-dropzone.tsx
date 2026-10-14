'use client'

import { useCallback, useState } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { useRouter } from 'next/navigation'
import { checkSelection, formatBytes, MAX_DOCUMENT_BYTES, MAX_UPLOAD_TOTAL_BYTES } from '@/lib/documents/validate-upload'

interface UploadItem {
  id: string
  name: string
  size: number
  /** 0–100 while sending; the server still has to store the file after 100. */
  percent: number
  state: 'waiting' | 'uploading' | 'done' | 'failed'
  error?: string
}

async function postJson(url: string, body: unknown): Promise<{ ok: true; data: Record<string, string> } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? 'Something went wrong. Please try again.' }
  } catch {
    return { ok: false, error: 'Could not reach the server — check your connection and try again.' }
  }
}

/**
 * Sends the file straight to storage through a one-time link. fetch() cannot
 * report upload progress, so this uses XMLHttpRequest.
 */
function putWithProgress(file: File, signedUrl: string, onProgress: (percent: number) => void): Promise<string | null> {
  return new Promise((resolve) => {
    const formData = new FormData()
    formData.append('cacheControl', '3600')
    formData.append('', file)

    const xhr = new XMLHttpRequest()
    xhr.open('PUT', signedUrl)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () =>
      resolve(xhr.status >= 200 && xhr.status < 300 ? null : `Could not upload ${file.name}. Please try again.`)
    xhr.onerror = () => resolve(`Could not upload ${file.name} — check your connection and try again.`)
    xhr.send(formData)
  })
}

/** Upload link, then the file itself, then the server checks and records it. Returns an error or null. */
async function uploadDocument(file: File, jobId: string, onProgress: (percent: number) => void): Promise<string | null> {
  const link = await postJson('/api/documents/upload-url', { jobId, fileName: file.name, size: file.size })
  if (!link.ok) return link.error
  const sendError = await putWithProgress(file, link.data.signedUrl, onProgress)
  if (sendError) return sendError
  const registered = await postJson('/api/documents/register', { jobId, path: link.data.path, fileName: file.name })
  return registered.ok ? null : registered.error
}

export function DocumentDropzone({ jobId }: { jobId: string }) {
  const [items, setItems] = useState<UploadItem[]>([])
  const [uploading, setUploading] = useState(false)
  const router = useRouter()

  const onDrop = useCallback(async (droppedFiles: File[], fileRejections: FileRejection[]) => {
    // Every limit is checked here, before anything is sent, with a reason per file
    const { accepted: acceptedFiles, rejected: refused } = checkSelection([
      ...droppedFiles,
      ...fileRejections.map((r) => r.file),
    ])
    const rejected: UploadItem[] = refused.map(({ file, error }, i) => ({
      id: `rejected-${Date.now()}-${i}`,
      name: file.name,
      size: file.size,
      percent: 0,
      state: 'failed',
      error,
    }))
    const queued: UploadItem[] = acceptedFiles.map((file, i) => ({
      id: `upload-${Date.now()}-${i}`,
      name: file.name,
      size: file.size,
      percent: 0,
      state: 'waiting',
    }))
    setItems([...queued, ...rejected])

    if (acceptedFiles.length === 0) return
    setUploading(true)

    const update = (id: string, patch: Partial<UploadItem>) =>
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))

    // One at a time, so a slow connection is not split across every file
    for (let i = 0; i < acceptedFiles.length; i++) {
      const id = queued[i].id
      update(id, { state: 'uploading' })
      const error = await uploadDocument(acceptedFiles[i], jobId, (percent) => update(id, { percent }))
      update(id, error ? { state: 'failed', error } : { state: 'done', percent: 100 })
    }

    setUploading(false)
    router.refresh()
  }, [jobId, router])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: uploading,
    // Limits are checked by checkSelection, so refused files get a clear reason
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'application/pdf': ['.pdf'],
    },
  })

  return (
    <div>
      <div
        {...getRootProps()}
        className={`border-[1.5px] border-dashed rounded-lg p-9 text-center text-sm transition-colors ${
          uploading ? 'cursor-wait opacity-70' : 'cursor-pointer'
        } ${isDragActive ? 'border-brand bg-brand-soft' : 'border-line text-ink-muted'}`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <p>Uploading documents…</p>
        ) : isDragActive ? (
          <p>Drop the files here…</p>
        ) : (
          <>
            <p>Drag and drop JPG, PNG, or PDF timecards here, or <strong className="text-ink">browse files</strong></p>
            <p className="mt-2 text-xs text-ink-muted">
              Up to <strong className="text-ink">{formatBytes(MAX_DOCUMENT_BYTES)} per file</strong> and{' '}
              <strong className="text-ink">{formatBytes(MAX_UPLOAD_TOTAL_BYTES)} in total</strong> per upload. Several
              files at once is fine; for more, upload in batches.
            </p>
          </>
        )}
      </div>

      {items.length > 0 && (
        <ul className="mt-3 space-y-2" aria-live="polite">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-ink">{item.name}</span>
                <span
                  className={`shrink-0 text-xs ${
                    item.state === 'failed' ? 'text-danger' : item.state === 'done' ? 'text-success' : 'text-ink-muted'
                  }`}
                >
                  {item.state === 'waiting' && 'Waiting'}
                  {item.state === 'uploading' && (item.percent < 100 ? `Uploading ${item.percent}%` : 'Saving…')}
                  {item.state === 'done' && `✓ Uploaded · ${formatBytes(item.size)}`}
                  {item.state === 'failed' && '✕ Not uploaded'}
                </span>
              </div>
              {item.state === 'uploading' && (
                <div className="mt-1 h-1 rounded bg-line" role="progressbar" aria-valuenow={item.percent} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-1 rounded bg-brand-blue transition-all" style={{ width: `${item.percent}%` }} />
                </div>
              )}
              {item.error && <p className="text-xs text-danger">{item.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
