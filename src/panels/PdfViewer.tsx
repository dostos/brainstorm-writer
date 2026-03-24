import React, { useEffect, useRef, useState, useCallback } from 'react'
import { IDockviewPanelProps } from 'dockview-react'
import * as pdfjsLib from 'pdfjs-dist'
import { TextLayer } from 'pdfjs-dist'
import 'pdfjs-dist/web/pdf_viewer.css'
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
  const dpr = window.devicePixelRatio || 1

  // Clear previous content
  container.innerHTML = ''
  container.style.width = `${viewport.width}px`
  container.style.height = `${viewport.height}px`
  container.style.position = 'relative'

  // Canvas layer — render at devicePixelRatio for sharp text
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width * dpr
  canvas.height = viewport.height * dpr
  canvas.style.width = `${viewport.width}px`
  canvas.style.height = `${viewport.height}px`
  canvas.style.display = 'block'
  container.appendChild(canvas)

  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  await page.render({ canvasContext: ctx, viewport }).promise

  // Text layer for selection — uses pdfjs official .textLayer CSS class
  const textContent = await page.getTextContent()
  const textLayerDiv = document.createElement('div')
  textLayerDiv.className = 'textLayer'
  textLayerDiv.style.position = 'absolute'
  textLayerDiv.style.left = '0'
  textLayerDiv.style.top = '0'
  textLayerDiv.style.width = `${viewport.width}px`
  textLayerDiv.style.height = `${viewport.height}px`
  // Set CSS custom properties that pdfjs TextLayer expects
  textLayerDiv.style.setProperty('--total-scale-factor', String(scale))
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

  // Load PDF — search root and common subdirectories
  const loadPdf = useCallback(async () => {
    if (!projectPath) return
    const names = ['main.pdf', 'output.pdf', 'paper.pdf']
    const dirs = ['', 'output', 'build', 'out', '_build']
    for (const dir of dirs) {
      for (const name of names) {
        const pdfPath = dir ? `${projectPath}/${dir}/${name}` : `${projectPath}/${name}`
        try {
          const buffer = await window.electronAPI.readFileBuffer(pdfPath)
          if (buffer) {
            const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
            setPdfDoc(doc)
            setTotalPages(doc.numPages)
            setCurrentPage(1)
            setManualScale(null)
            return
          }
        } catch { /* not found, try next */ }
      }
    }
    // Fallback: find any .pdf in root or output/
    try {
      const tree = await window.electronAPI.findPdfs(projectPath)
      if (tree && tree.length > 0) {
        const buffer = await window.electronAPI.readFileBuffer(tree[0])
        if (buffer) {
          const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
          setPdfDoc(doc)
          setTotalPages(doc.numPages)
          setCurrentPage(1)
          setManualScale(null)
        }
      }
    } catch { /* no findPdfs handler or no PDFs */ }
  }, [projectPath])

  useEffect(() => {
    loadPdf().catch(console.error)
  }, [loadPdf])

  // Render pages with debounce (300ms) for smooth zoom
  useEffect(() => {
    if (!pdfDoc || scale === null) return
    const render = async () => {
      if (continuousMode) {
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const container = pageContainerRefs.current.get(i)
          if (!container) continue
          await renderPage(pdfDoc, i, container, effectiveScale)
        }
      } else if (singlePageRef.current) {
        await renderPage(pdfDoc, currentPage, singlePageRef.current, effectiveScale)
      }
    }
    const timer = setTimeout(() => render().catch(console.error), 200)
    return () => clearTimeout(timer)
  }, [pdfDoc, effectiveScale, continuousMode, totalPages, scale, currentPage])

  // Double-click: find the selected/clicked text in .tex source files and open
  const handlePageClick = useCallback(async (pageNum: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.detail < 2) return

    // First try SyncTeX
    const container = e.currentTarget
    const rect = container.getBoundingClientRect()
    const x = (e.clientX - rect.left) / effectiveScale
    const y = (e.clientY - rect.top) / effectiveScale

    const synctexResult = await window.electronAPI.synctexInverse(pageNum, x, y)
    if (synctexResult) {
      openFile(synctexResult.file)
      setActiveFile(synctexResult.file)
      return
    }

    // Fallback: search selected text in .tex files
    if (!projectPath) return
    const sel = document.getSelection()
    const selectedText = sel?.toString().trim()
    if (!selectedText || selectedText.length < 5) return

    const searchResult = await window.electronAPI.searchTex(projectPath, selectedText)
    if (searchResult) {
      openFile(searchResult.file)
      setActiveFile(searchResult.file)
      // Jump to the matching line after a small delay (let editor load the file)
      setTimeout(() => {
        useEditorStore.getState().jumpToLine(searchResult.line)
      }, 300)
    }
  }, [effectiveScale, openFile, setActiveFile, projectPath])

  // Capture PDF text selection → push to editor store for AI panel
  const { setSelection } = useEditorStore()
  useEffect(() => {
    const handler = () => {
      const sel = document.getSelection()
      if (!sel || sel.isCollapsed) return
      const text = sel.toString().trim()
      if (!text) return
      // Check if selection is inside our PDF container
      const anchor = sel.anchorNode
      if (anchor && scrollContainerRef.current?.contains(anchor)) {
        setSelection({ text, from: -1, to: -1 }) // from/to = -1 indicates PDF source
      }
    }
    document.addEventListener('mouseup', handler)
    return () => document.removeEventListener('mouseup', handler)
  }, [setSelection])

  // Panning: Space+drag or middle-click drag
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    let isPanning = false
    let spaceDown = false
    let startX = 0
    let startY = 0
    let scrollL = 0
    let scrollT = 0

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !spaceDown && e.target === document.body) {
        spaceDown = true
        container.style.cursor = 'grab'
        e.preventDefault()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown = false
        if (!isPanning) container.style.cursor = ''
      }
    }
    const onDown = (e: MouseEvent) => {
      if (!spaceDown && e.button !== 1) return
      e.preventDefault()
      isPanning = true
      startX = e.clientX
      startY = e.clientY
      scrollL = container.scrollLeft
      scrollT = container.scrollTop
      container.style.cursor = 'grabbing'
    }
    const onMove = (e: MouseEvent) => {
      if (!isPanning) return
      container.scrollLeft = scrollL - (e.clientX - startX)
      container.scrollTop = scrollT - (e.clientY - startY)
    }
    const onUp = () => {
      isPanning = false
      container.style.cursor = spaceDown ? 'grab' : ''
    }

    // Ctrl+scroll = zoom, Shift+scroll = horizontal scroll
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const delta = e.deltaY > 0 ? -0.15 : 0.15
        adjustScale(delta)
      } else if (e.shiftKey) {
        e.preventDefault()
        container.scrollLeft += e.deltaY
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    container.addEventListener('mousedown', onDown)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    container.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
      container.removeEventListener('mousedown', onDown)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      container.removeEventListener('wheel', onWheel)
    }
  }, [adjustScale])

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
        <button onClick={() => adjustScale(-0.2)}
          style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>−</button>
        <span
          onClick={resetFit}
          style={{ cursor: 'pointer', color: manualScale ? '#ccc' : '#6c9', minWidth: 36, textAlign: 'center' }}
          title="Click to fit width"
        >
          {Math.round(effectiveScale * 100)}%
        </span>
        <button onClick={() => adjustScale(0.2)}
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
