'use client'

import { useCallback, useState } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { useRouter } from 'next/navigation'
import { MAX_WORKBOOK_BYTES } from '@/lib/excel/limits'
import { formatBytes } from '@/lib/documents/validate-upload'

export function ExcelDropzone({ jobId }: { jobId: string }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const onDrop = useCallback(async (acceptedFiles: File[], fileRejections: FileRejection[]) => {
    if (fileRejections.length > 0) {
      setError(`${fileRejections[0].file.name}: unsupported file type. Please upload an .xlsx file.`)
      return
    }

    const file = acceptedFiles[0]
    if (!file) return
    if (file.size > MAX_WORKBOOK_BYTES) {
      setError(`${file.name} is ${formatBytes(file.size)}; templates can be up to ${formatBytes(MAX_WORKBOOK_BYTES)}.`)
      return
    }

    setUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('jobId', jobId)

    const res = await fetch('/api/workbooks/upload', { method: 'POST', body: formData })
    const result = await res.json()
    setUploading(false)

    if (!res.ok) {
      setError(result.error ?? 'Upload failed.')
      return
    }

    router.refresh()
  }, [jobId, router])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
  })

  return (
    <div>
      <div
        {...getRootProps()}
        className={`border-[1.5px] border-dashed rounded-lg p-9 text-center text-sm cursor-pointer transition-colors ${
          isDragActive ? 'border-brand bg-brand-soft' : 'border-line text-ink-muted'
        }`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <p>Uploading and reading your workbook…</p>
        ) : isDragActive ? (
          <p>Drop the file here…</p>
        ) : (
          <>
            <p>Drag and drop your Excel template here, or <strong className="text-ink">browse files</strong></p>
            <p className="mt-2 text-xs text-ink-muted">
              One .xlsx file, up to <strong className="text-ink">{formatBytes(MAX_WORKBOOK_BYTES)}</strong>
            </p>
          </>
        )}
      </div>
      {error && <p className="text-sm text-danger mt-3">{error}</p>}
    </div>
  )
}