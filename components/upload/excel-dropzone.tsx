'use client'

import { useCallback, useState } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { useRouter } from 'next/navigation'

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
          isDragActive ? 'border-[#A97C33] bg-[#FBF6EE]' : 'border-[#DADDD5] text-[#5B6B78]'
        }`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <p>Uploading and reading your workbook…</p>
        ) : isDragActive ? (
          <p>Drop the file here…</p>
        ) : (
          <p>Drag and drop your Excel template here, or <strong className="text-[#1E2B3A]">browse files</strong></p>
        )}
      </div>
      {error && <p className="text-sm text-[#B5522E] mt-3">{error}</p>}
    </div>
  )
}