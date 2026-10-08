'use client'

import { useCallback, useState } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { useRouter } from 'next/navigation'

export function DocumentDropzone({ jobId }: { jobId: string }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const onDrop = useCallback(async (acceptedFiles: File[], fileRejections: FileRejection[]) => {
    setError(null)

    if (fileRejections.length > 0) {
      const names = fileRejections.map((r) => r.file.name).join(', ')
      setError(`Unsupported file type: ${names}. Please upload JPG, PNG, or PDF files only.`)
    }

    if (acceptedFiles.length === 0) return
    setUploading(true)

    for (const file of acceptedFiles) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('jobId', jobId)

      const res = await fetch('/api/documents/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const result = await res.json()
        setError((prev) => (prev ? `${prev} Also: ` : '') + (result.error ?? `Could not upload ${file.name}.`))
      }
    }

    setUploading(false)
    router.refresh()
  }, [jobId, router])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
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
        className={`border-[1.5px] border-dashed rounded-lg p-9 text-center text-sm cursor-pointer transition-colors ${
          isDragActive ? 'border-[#A97C33] bg-[#FBF6EE]' : 'border-[#DADDD5] text-[#5B6B78]'
        }`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <p>Uploading documents…</p>
        ) : isDragActive ? (
          <p>Drop the files here…</p>
        ) : (
          <p>Drag and drop JPG, PNG, or PDF timecards here, or <strong className="text-[#1E2B3A]">browse files</strong></p>
        )}
      </div>
      {error && <p className="text-sm text-[#B5522E] mt-3">{error}</p>}
    </div>
  )
}