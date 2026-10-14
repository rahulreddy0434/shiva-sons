'use client'

import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import type { Box } from '@/lib/azure/document-intelligence'

// Served from public/pdfjs (copied there by scripts/copy-pdf-worker.mjs)
const ASSETS = '/pdfjs/'
const WORKER_SRC = `${ASSETS}pdf.worker.min.mjs`

// One loaded PDF per signed URL, kept while the review screen is open
const documentCache = new Map<string, Promise<PDFDocumentProxy>>()

async function loadPdf(url: string): Promise<PDFDocumentProxy> {
  let cached = documentCache.get(url)
  if (!cached) {
    cached = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC
      return pdfjs.getDocument({
        url,
        // Decoders for scanned images; without them a scan's handwriting layer is skipped
        wasmUrl: `${ASSETS}wasm/`,
        iccUrl: `${ASSETS}iccs/`,
        cMapUrl: `${ASSETS}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${ASSETS}standard_fonts/`,
      }).promise
    })
    // A failed load is not cached, so a retry can succeed
    cached.catch(() => documentCache.delete(url))
    documentCache.set(url, cached)
  }
  return cached
}

/**
 * One page of the original document at the panel's width times `zoom`, with
 * the highlighted boxes drawn over it. Boxes are fractions of the page, so
 * they stay on the right spot at any size, and rotate with the page.
 */
export function PageCanvas({
  url,
  isPdf,
  pageNumber,
  zoom,
  rotation,
  highlights,
  alt,
}: {
  url: string
  isPdf: boolean
  pageNumber: number
  zoom: number
  rotation: number
  highlights: Box[]
  alt: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  // Page height ÷ width, known once the page or image has loaded (A4 until then)
  const [aspect, setAspect] = useState(1.414)
  // Which render last finished, and how; anything else is still loading
  const [finished, setFinished] = useState<{ key: string; ok: boolean } | null>(null)
  // Whether this page has been drawn once, so a redraw at a new size keeps showing the old one
  const [drawnPage, setDrawnPage] = useState<string | null>(null)
  // At 100% the page fills the panel's width; a page turned sideways is scaled
  // so that its turned width fits instead
  const sideways = rotation % 180 !== 0
  const pageWidth = Math.floor(width * zoom * (sideways ? 1 / aspect : 1))
  const pageHeight = pageWidth * aspect
  const renderKey = `${url}|${pageNumber}|${pageWidth}`
  const status = finished?.key === renderKey ? (finished.ok ? 'ready' : 'failed') : 'loading'

  // Follow the panel's width so the page always fits it at 100%
  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    // Changes of a pixel or two (rounding, a scrollbar) are ignored, so the page
    // cannot get into a loop of resizing itself
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.floor(entry.contentRect.width)
      setWidth((current) => (Math.abs(next - current) > 2 ? next : current))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isPdf || pageWidth === 0) return
    let cancelled = false
    let task: RenderTask | null = null
    const key = `${url}|${pageNumber}|${pageWidth}`

    loadPdf(url)
      .then(async (pdf) => {
        if (cancelled) return
        const page = await pdf.getPage(pageNumber)
        const canvas = canvasRef.current
        if (cancelled || !canvas) return
        const base = page.getViewport({ scale: 1 })
        setAspect(base.height / base.width)
        const cssWidth = pageWidth
        const pixelRatio = window.devicePixelRatio || 1
        const viewport = page.getViewport({
          scale: (cssWidth / base.width) * pixelRatio,
        })
        // Drawn off-screen first and copied over when complete, so the page on
        // screen never blanks or flickers while a new size is drawn
        const offscreen = document.createElement('canvas')
        offscreen.width = Math.floor(viewport.width)
        offscreen.height = Math.floor(viewport.height)
        task = page.render({ canvas: offscreen, viewport })
        await task.promise
        if (cancelled) return
        canvas.width = offscreen.width
        canvas.height = offscreen.height
        canvas.getContext('2d')?.drawImage(offscreen, 0, 0)
        setFinished({ key, ok: true })
        setDrawnPage(`${url}|${pageNumber}`)
      })
      .catch((err: unknown) => {
        // A render replaced by a newer one is not a failure
        if (cancelled || (err instanceof Error && err.name === 'RenderingCancelledException')) return
        setFinished({ key, ok: false })
      })

    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [url, isPdf, pageNumber, pageWidth])

  // Bring the highlighted value into view, again after the page is turned or resized
  const highlightKey = JSON.stringify(highlights)
  useEffect(() => {
    if (highlights.length === 0 || (isPdf && status !== 'ready')) return
    highlightRef.current?.scrollIntoView({
      block: 'center',
      inline: 'center',
      behavior: 'smooth',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run when the boxes change, not the array identity
  }, [highlightKey, status, isPdf, rotation, aspect])

  const overlay = highlights.map((box, i) => (
    <div
      key={i}
      ref={i === 0 ? highlightRef : undefined}
      data-testid="source-highlight"
      aria-hidden
      className="pointer-events-none absolute rounded-sm border-2 border-brand-blue bg-brand-blue/15"
      style={{
        left: `calc(${box[0] * 100}% - 3px)`,
        top: `calc(${box[1] * 100}% - 3px)`,
        width: `calc(${box[2] * 100}% + 6px)`,
        height: `calc(${box[3] * 100}% + 6px)`,
      }}
    />
  ))

  // Only a page not drawn yet shows as loading; a resize keeps the last drawing up
  const firstDraw = isPdf && status === 'loading' && drawnPage !== `${url}|${pageNumber}`

  // The box the page takes up is its rotated shape, so a turned or zoomed page
  // can be scrolled to every edge; the page itself is turned inside it

  return (
    <div ref={containerRef} className="relative w-full">
      {isPdf && status === 'failed' ? (
        <p className="p-4 text-sm text-danger">
          ✕ This page could not be displayed. Use “Open in new tab” to see the original.
        </p>
      ) : (
        <div
          className="relative mx-auto"
          style={{
            width: sideways ? pageHeight : pageWidth,
            height: sideways ? pageWidth : pageHeight,
          }}
        >
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              width: pageWidth,
              height: pageHeight,
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
            }}
          >
            {isPdf ? (
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={alt}
                className={`block h-full w-full bg-white shadow-sm ${firstDraw ? 'opacity-40' : ''}`}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL to a private upload
              <img
                src={url}
                alt={alt}
                onLoad={(e) => setAspect(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth)}
                className="block h-full w-full bg-white"
              />
            )}
            {overlay}
          </div>
        </div>
      )}
      {/* Over the page rather than below it, so it never changes the panel's size */}
      {firstDraw && (
        <p className="absolute left-2 top-2 rounded bg-white/90 px-2 py-1 text-xs text-ink-muted">Loading page…</p>
      )}
    </div>
  )
}
