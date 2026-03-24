import React, { useEffect, useRef, useState, useCallback } from 'react'
import { IDockviewPanelProps } from 'dockview-react'
import * as pdfjsLib from 'pdfjs-dist'
import { useProjectStore } from '../stores/project-store'
import { useEditorStore } from '../stores/editor-store'

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

export const PdfViewer: React.FC<IDockviewPanelProps> = () => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1.2)
  const [continuousMode, setContinuousMode] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const { projectPath } = useProjectStore()
  const { openFile, setActiveFile } = useEditorStore()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const singleCanvasRef = useRef<HTMLCanvasElement>(null)

  // Find and load PDF in project via IPC (avoids file:// CSP issues)
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
          return
        }
      } catch { /* not found, try next */ }
    }
  }, [projectPath])

  useEffect(() => {
    loadPdf().catch(console.error)
  }, [loadPdf])

  // Render single page (page-by-page mode)
  useEffect(() => {
    if (!pdfDoc || continuousMode || !singleCanvasRef.current) return
    pdfDoc.getPage(currentPage).then((page) => {
      const viewport = page.getViewport({ scale })
      const canvas = singleCanvasRef.current!
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      page.render({ canvasContext: ctx, viewport })
    })
  }, [pdfDoc, currentPage, scale, continuousMode])

  // Render all pages (continuous mode)
  useEffect(() => {
    if (!pdfDoc || !continuousMode) return
    const renderPages = async () => {
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const canvas = canvasRefs.current.get(i)
        if (!canvas) continue
        const page = await pdfDoc.getPage(i)
        const viewport = page.getViewport({ scale })
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport }).promise
      }
    }
    // Small delay to let canvases mount
    const timer = setTimeout(() => renderPages().catch(console.error), 50)
    return () => clearTimeout(timer)
  }, [pdfDoc, scale, continuousMode, totalPages])

  // Handle SyncTeX click
  const handleCanvasClick = useCallback(async (page: number, e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale

    const result = await window.electronAPI.synctexInverse(page, x, y)
    if (result) {
      openFile(result.file)
      setActiveFile(result.file)
    }
  }, [scale, openFile, setActiveFile])

  // Watch for PDF changes and reload
  useEffect(() => {
    const cleanup = window.electronAPI.onFileChanged((filePath: string) => {
      if (filePath.endsWith('.pdf')) {
        loadPdf().catch(console.error)
      }
    })
    return cleanup
  }, [loadPdf])

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
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '4px 8px', borderBottom: '1px solid #333', fontSize: 12, color: '#888',
      }}>
        {!continuousMode && (
          <>
            <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}
              style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>◀</button>
            <span>Page {currentPage} / {totalPages}</span>
            <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages}
              style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>▶</button>
            <span style={{ margin: '0 4px' }}>|</span>
          </>
        )}
        {continuousMode && <span>{totalPages} pages</span>}
        <span style={{ margin: '0 4px' }}>|</span>
        <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
          style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>−</button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(3, s + 0.1))}
          style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>+</button>
        <span style={{ margin: '0 4px' }}>|</span>
        <button
          onClick={() => setContinuousMode(!continuousMode)}
          style={{
            background: continuousMode ? '#3a3a5e' : 'none',
            border: '1px solid #444',
            color: '#ccc',
            cursor: 'pointer',
            padding: '1px 6px',
            borderRadius: 3,
            fontSize: 11,
          }}
        >
          {continuousMode ? 'Continuous' : 'Page'}
        </button>
      </div>

      {/* PDF content */}
      <div ref={scrollContainerRef} style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {continuousMode ? (
          // Continuous scrolling: render all pages stacked
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <canvas
                key={pageNum}
                ref={(el) => {
                  if (el) canvasRefs.current.set(pageNum, el)
                  else canvasRefs.current.delete(pageNum)
                }}
                onClick={(e) => handleCanvasClick(pageNum, e)}
                style={{ cursor: 'crosshair', display: 'block', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
              />
            ))}
          </div>
        ) : (
          // Single page mode
          <div style={{ display: 'flex', justifyContent: 'center', minHeight: '100%' }}>
            <canvas
              ref={singleCanvasRef}
              onClick={(e) => handleCanvasClick(currentPage, e)}
              style={{ cursor: 'crosshair', display: 'block' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
