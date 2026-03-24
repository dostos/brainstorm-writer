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
  const containerRef = useRef<HTMLDivElement>(null)
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1.2)
  const { projectPath } = useProjectStore()
  const { openFile, setActiveFile } = useEditorStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

  // Load PDF
  useEffect(() => {
    loadPdf().catch(console.error)
  }, [loadPdf])

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    pdfDoc.getPage(currentPage).then((page) => {
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current!
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      page.render({ canvasContext: ctx, viewport })
    })
  }, [pdfDoc, currentPage, scale])

  // Handle text selection in PDF for SyncTeX
  const handleCanvasClick = useCallback(async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale

    const result = await window.electronAPI.synctexInverse(currentPage, x, y)
    if (result) {
      openFile(result.file)
      setActiveFile(result.file)
      // Editor will handle jumping to the line via a separate mechanism
    }
  }, [currentPage, scale, openFile, setActiveFile])

  // Watch for PDF changes and reload via IPC buffer
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
        <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}
          style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>◀</button>
        <span>Page {currentPage} / {totalPages}</span>
        <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages}
          style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>▶</button>
        <span style={{ margin: '0 8px' }}>|</span>
        <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
          style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>−</button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(3, s + 0.1))}
          style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>+</button>
      </div>
      {/* PDF canvas */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: 12 }}>
        <canvas ref={canvasRef} onClick={handleCanvasClick} style={{ cursor: 'crosshair' }} />
      </div>
    </div>
  )
}
