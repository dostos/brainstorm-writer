import React, { useEffect, useRef, useState, useCallback } from 'react'
import { IDockviewPanelProps } from 'dockview-react'
import * as pdfjsLib from 'pdfjs-dist'
import { TextLayer } from 'pdfjs-dist'
import { useProjectStore } from '../stores/project-store'
import { useEditorStore } from '../stores/editor-store'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

async function renderPage(
  doc: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  container: HTMLDivElement,
  scale: number,
) {
  const page = await doc.getPage(pageNum)
  const viewport = page.getViewport({ scale })

  // Clear previous content
  container.innerHTML = ''
  container.style.width = `${viewport.width}px`
  container.style.height = `${viewport.height}px`
  container.style.position = 'relative'

  // Canvas layer
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  canvas.style.display = 'block'
  container.appendChild(canvas)

  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport }).promise

  // Text layer for selection
  const textContent = await page.getTextContent()
  const textLayerDiv = document.createElement('div')
  textLayerDiv.style.position = 'absolute'
  textLayerDiv.style.left = '0'
  textLayerDiv.style.top = '0'
  textLayerDiv.style.width = `${viewport.width}px`
  textLayerDiv.style.height = `${viewport.height}px`
  textLayerDiv.style.overflow = 'hidden'
  textLayerDiv.style.lineHeight = '1.0'
  textLayerDiv.className = 'pdf-text-layer'
  container.appendChild(textLayerDiv)

  const textLayer = new TextLayer({
    textContentSource: textContent,
    container: textLayerDiv,
    viewport,
  })
  await textLayer.render()
}

export const PdfViewer: React.FC<IDockviewPanelProps> = () => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState<number | null>(null) // null = auto-fit
  const [manualScale, setManualScale] = useState<number | null>(null)
  const [continuousMode, setContinuousMode] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const { projectPath } = useProjectStore()
  const { openFile, setActiveFile } = useEditorStore()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pageContainerRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const singlePageRef = useRef<HTMLDivElement>(null)

  // Compute auto-fit scale based on container width and first page
  const computeFitScale = useCallback(async () => {
    if (!pdfDoc || !scrollContainerRef.current) return null
    const page = await pdfDoc.getPage(1)
    const defaultViewport = page.getViewport({ scale: 1.0 })
    const containerWidth = scrollContainerRef.current.clientWidth - 32 // padding
    return containerWidth / defaultViewport.width
  }, [pdfDoc])

  // Determine effective scale
  const effectiveScale = manualScale ?? scale ?? 1.2

  // Auto-fit on load and resize
  useEffect(() => {
    if (!pdfDoc || manualScale !== null) return
    const updateFit = async () => {
      const fitScale = await computeFitScale()
      if (fitScale) setScale(fitScale)
    }
    updateFit()

    const observer = new ResizeObserver(() => updateFit())
    if (scrollContainerRef.current) {
      observer.observe(scrollContainerRef.current)
    }
    return () => observer.disconnect()
  }, [pdfDoc, computeFitScale, manualScale])

  // Load PDF
  const loadPdf = useCallback(async () => {
    if (!projectPath) return
    const candidates = ['main.pdf', 'output.pdf', 'paper.pdf']
    for (const name of candidates) {
      const pdfPath = `${projectPath}/${name}`
      try {
        const buffer = await window.electronAPI.readFileBuffer(pdfPath)
        if (buffer) {
          const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
          setPdfDoc(doc)
          setTotalPages(doc.numPages)
          setCurrentPage(1)
          setManualScale(null) // reset to auto-fit
          return
        }
      } catch { /* not found */ }
    }
  }, [projectPath])

  useEffect(() => {
    loadPdf().catch(console.error)
  }, [loadPdf])

  // Render pages (continuous mode)
  useEffect(() => {
    if (!pdfDoc || !continuousMode || scale === null) return
    const render = async () => {
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const container = pageContainerRefs.current.get(i)
        if (!container) continue
        await renderPage(pdfDoc, i, container, effectiveScale)
      }
    }
    const timer = setTimeout(() => render().catch(console.error), 50)
    return () => clearTimeout(timer)
  }, [pdfDoc, effectiveScale, continuousMode, totalPages, scale])

  // Render single page
  useEffect(() => {
    if (!pdfDoc || continuousMode || !singlePageRef.current || scale === null) return
    renderPage(pdfDoc, currentPage, singlePageRef.current, effectiveScale).catch(console.error)
  }, [pdfDoc, currentPage, effectiveScale, continuousMode, scale])

  // SyncTeX click handler (on the container, not canvas directly since text layer is on top)
  const handlePageClick = useCallback(async (pageNum: number, e: React.MouseEvent<HTMLDivElement>) => {
    // Only trigger on double-click to avoid interfering with text selection
    if (e.detail < 2) return
    const container = e.currentTarget
    const rect = container.getBoundingClientRect()
    const x = (e.clientX - rect.left) / effectiveScale
    const y = (e.clientY - rect.top) / effectiveScale

    const result = await window.electronAPI.synctexInverse(pageNum, x, y)
    if (result) {
      openFile(result.file)
      setActiveFile(result.file)
    }
  }, [effectiveScale, openFile, setActiveFile])

  // Watch for PDF changes
  useEffect(() => {
    const cleanup = window.electronAPI.onFileChanged((filePath: string) => {
      if (filePath.endsWith('.pdf')) {
        loadPdf().catch(console.error)
      }
    })
    return cleanup
  }, [loadPdf])

  const adjustScale = (delta: number) => {
    const current = manualScale ?? scale ?? 1.2
    const newScale = Math.max(0.3, Math.min(5, current + delta))
    setManualScale(newScale)
  }

  const resetFit = () => {
    setManualScale(null)
  }

  if (!projectPath) {
    return (
      <div style={{ padding: 20, color: '#666', textAlign: 'center', marginTop: 40 }}>
        Open a project to view PDF
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        padding: '4px 8px', borderBottom: '1px solid #333', fontSize: 11, color: '#888',
      }}>
        {!continuousMode && (
          <>
            <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}
              style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 12 }}>◀</button>
            <span>{currentPage}/{totalPages}</span>
            <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages}
              style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 12 }}>▶</button>
            <span style={{ color: '#444' }}>|</span>
          </>
        )}
        <button onClick={() => adjustScale(-0.1)}
          style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>−</button>
        <span
          onClick={resetFit}
          style={{ cursor: 'pointer', color: manualScale ? '#ccc' : '#6c9', minWidth: 36, textAlign: 'center' }}
          title="Click to fit width"
        >
          {Math.round(effectiveScale * 100)}%
        </span>
        <button onClick={() => adjustScale(0.1)}
          style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>+</button>
        <span style={{ color: '#444' }}>|</span>
        <button
          onClick={() => setContinuousMode(!continuousMode)}
          style={{
            background: continuousMode ? '#3a3a5e' : 'none',
            border: '1px solid #444', color: '#ccc', cursor: 'pointer',
            padding: '1px 6px', borderRadius: 3,
          }}
        >
          {continuousMode ? 'Scroll' : 'Page'}
        </button>
      </div>

      {/* PDF content */}
      <div ref={scrollContainerRef} style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        {continuousMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <div
                key={pageNum}
                ref={(el) => {
                  if (el) pageContainerRefs.current.set(pageNum, el)
                  else pageContainerRefs.current.delete(pageNum)
                }}
                onDoubleClick={(e) => handlePageClick(pageNum, e)}
                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.3)', background: '#fff' }}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div
              ref={singlePageRef}
              onDoubleClick={(e) => handlePageClick(currentPage, e)}
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.3)', background: '#fff' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
