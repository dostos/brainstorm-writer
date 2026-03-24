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

// Clear canvas memory for a page container while preserving its dimensions (placeholder)
function clearPageCanvas(container: HTMLDivElement) {
  // Keep width/height so scrollbar remains accurate; just remove child nodes
  container.innerHTML = ''
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
  const pendingPdfJump = useEditorStore((s) => s.pendingPdfJump)
  const clearPdfJump = useEditorStore((s) => s.clearPdfJump)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pageContainerRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const singlePageRef = useRef<HTMLDivElement>(null)

  // Track which pages have been rendered in continuous mode
  const renderedPagesRef = useRef<Set<number>>(new Set())
  // Store page viewport dimensions so placeholders have correct sizes before render
  const pageDimensionsRef = useRef<Map<number, { width: number; height: number }>>(new Map())
  // IntersectionObserver instance
  const intersectionObserverRef = useRef<IntersectionObserver | null>(null)
  // Debounce timer for observer callbacks
  const observerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref to always have current effectiveScale inside observer callbacks
  const effectiveScaleRef = useRef<number>(1.2)

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

  // Keep ref in sync so observer callbacks always see latest scale
  useEffect(() => {
    effectiveScaleRef.current = effectiveScale
  }, [effectiveScale])

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

  // Try to parse SyncTeX; if not found, auto-build ONCE to generate it
  const hasTriedAutoBuild = useRef(false)
  const tryParseSynctex = useCallback(async (pdfPath: string) => {
    const synctexPath = pdfPath.replace(/\.pdf$/, '.synctex.gz')
    try {
      await window.electronAPI.parseSynctex(synctexPath)
    } catch {
      // SyncTeX not found — auto-build once to generate it
      if (projectPath && !hasTriedAutoBuild.current) {
        hasTriedAutoBuild.current = true
        try {
          await window.electronAPI.buildLatex(projectPath)
          // After build, try parsing again
          try {
            await window.electronAPI.parseSynctex(synctexPath)
          } catch { /* still not available */ }
        } catch { /* build failed */ }
      }
    }
  }, [projectPath])

  // Load PDF — single IPC call finds the best PDF in the project
  const loadPdf = useCallback(async () => {
    if (!projectPath) return
    try {
      const result = await window.electronAPI.findProjectPdf(projectPath)
      if (result) {
        // Save scroll position before replacing the document
        const savedScrollTop = scrollContainerRef.current?.scrollTop ?? 0
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(result.buffer) }).promise
        // Destroy previous document to release memory
        setPdfDoc((prev) => {
          prev?.destroy()
          return doc
        })
        const isFirstLoad = !pdfDoc
        setTotalPages(doc.numPages)
        if (isFirstLoad) setCurrentPage(1)
        if (isFirstLoad) setManualScale(null)
        renderedPagesRef.current.clear()
        pageDimensionsRef.current.clear()
        tryParseSynctex(result.path)
        // Restore scroll position after React has flushed the new render
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = savedScrollTop
          }
        })
      }
    } catch { /* no PDF found */ }
  }, [projectPath, tryParseSynctex])

  useEffect(() => {
    loadPdf().catch(console.error)
  }, [loadPdf])

  // Pre-fetch page dimensions (at scale=1) for all pages so placeholders have correct sizes.
  // We do this once when pdfDoc is available, cheaply, without rendering.
  useEffect(() => {
    if (!pdfDoc) return
    pageDimensionsRef.current.clear()
    let cancelled = false
    ;(async () => {
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        if (cancelled) break
        const page = await pdfDoc.getPage(i)
        const vp = page.getViewport({ scale: 1.0 })
        pageDimensionsRef.current.set(i, { width: vp.width, height: vp.height })
      }
    })().catch(console.error)
    return () => { cancelled = true }
  }, [pdfDoc])

  // Apply placeholder dimensions to all continuous-mode page containers whenever scale changes.
  // This keeps the scrollbar proportions accurate even before a page is rendered.
  useEffect(() => {
    if (!continuousMode) return
    pageContainerRefs.current.forEach((container, pageNum) => {
      const dims = pageDimensionsRef.current.get(pageNum)
      if (dims && container.innerHTML === '') {
        container.style.width = `${dims.width * effectiveScale}px`
        container.style.height = `${dims.height * effectiveScale}px`
      }
    })
  }, [effectiveScale, continuousMode, totalPages])

  // Core: handle IntersectionObserver events for continuous mode
  const handleIntersections = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (!pdfDoc) return

      const currentScale = effectiveScaleRef.current

      entries.forEach((entry) => {
        const pageNum = Number((entry.target as HTMLElement).dataset.pageNum)
        if (!pageNum) return

        if (entry.isIntersecting) {
          // Page is (near) visible — render if not already rendered at this scale
          if (!renderedPagesRef.current.has(pageNum)) {
            const container = pageContainerRefs.current.get(pageNum)
            if (container) {
              renderedPagesRef.current.add(pageNum)
              renderPage(pdfDoc, pageNum, container, currentScale).catch(() => {
                renderedPagesRef.current.delete(pageNum)
              })
            }
          }
        }
      })

      // After processing intersections, clear pages that are far off-screen (>2 pages away)
      // Determine the set of currently intersecting page numbers
      const visiblePages = new Set<number>()
      // We need to query all observed entries — gather from the current observer
      const observer = intersectionObserverRef.current
      if (!observer) return

      // Walk all page refs to find which are currently near-visible via the root margin
      // We approximate "visible" as any page that has been observed and is intersecting.
      // To determine far-away pages we compare against the min/max visible page.
      pageContainerRefs.current.forEach((container, pageNum) => {
        // Use getBoundingClientRect relative to scroll container
        const scrollContainer = scrollContainerRef.current
        if (!scrollContainer) return
        const scrollRect = scrollContainer.getBoundingClientRect()
        const pageRect = container.getBoundingClientRect()
        // Page is within extended viewport (1 page margin = rootMargin handles this)
        // Here we check if page is within 2-page distance for clearing
        const viewportTop = scrollRect.top
        const viewportBottom = scrollRect.bottom
        const pageHeight = pageRect.height || (pageDimensionsRef.current.get(pageNum)?.height ?? 800) * effectiveScaleRef.current
        const margin = pageHeight * 2

        if (pageRect.bottom >= viewportTop - margin && pageRect.top <= viewportBottom + margin) {
          visiblePages.add(pageNum)
        }
      })

      // Clear pages that are far away and currently rendered
      renderedPagesRef.current.forEach((pageNum) => {
        if (!visiblePages.has(pageNum)) {
          const container = pageContainerRefs.current.get(pageNum)
          if (container) {
            clearPageCanvas(container)
            // Restore placeholder dimensions
            const dims = pageDimensionsRef.current.get(pageNum)
            if (dims) {
              container.style.width = `${dims.width * effectiveScaleRef.current}px`
              container.style.height = `${dims.height * effectiveScaleRef.current}px`
            }
          }
          renderedPagesRef.current.delete(pageNum)
        }
      })
    },
    [pdfDoc],
  )

  // Debounced version of handleIntersections
  const debouncedHandleIntersections = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (observerDebounceRef.current) clearTimeout(observerDebounceRef.current)
      observerDebounceRef.current = setTimeout(() => {
        handleIntersections(entries)
      }, 50)
    },
    [handleIntersections],
  )

  // Set up IntersectionObserver in continuous mode
  useEffect(() => {
    if (!continuousMode || !pdfDoc || !scrollContainerRef.current) return
    if (scale === null) return // wait for scale to be computed

    // Disconnect previous observer
    intersectionObserverRef.current?.disconnect()
    intersectionObserverRef.current = null

    // Clear rendered set — scale may have changed, need re-render
    renderedPagesRef.current.clear()

    // Clear all page containers to placeholders
    pageContainerRefs.current.forEach((container, pageNum) => {
      clearPageCanvas(container)
      const dims = pageDimensionsRef.current.get(pageNum)
      if (dims) {
        container.style.width = `${dims.width * effectiveScale}px`
        container.style.height = `${dims.height * effectiveScale}px`
      }
    })

    // rootMargin: observe pages within 1 page height above/below viewport.
    // We use a fixed pixel estimate for the initial margin; the observer will
    // fire immediately for any already-visible pages.
    const approxPageHeight = (() => {
      const dims = pageDimensionsRef.current.get(1)
      return dims ? Math.round(dims.height * effectiveScale) : 1000
    })()

    const observer = new IntersectionObserver(debouncedHandleIntersections, {
      root: scrollContainerRef.current,
      rootMargin: `${approxPageHeight}px 0px ${approxPageHeight}px 0px`,
      threshold: 0,
    })

    intersectionObserverRef.current = observer

    // Observe all page containers
    pageContainerRefs.current.forEach((container) => {
      observer.observe(container)
    })

    return () => {
      observer.disconnect()
      intersectionObserverRef.current = null
      if (observerDebounceRef.current) {
        clearTimeout(observerDebounceRef.current)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, continuousMode, effectiveScale, scale, debouncedHandleIntersections])

  // Single-page mode: render with debounce (300ms) for smooth zoom
  useEffect(() => {
    if (!pdfDoc || scale === null || continuousMode) return
    const timer = setTimeout(() => {
      if (singlePageRef.current) {
        renderPage(pdfDoc, currentPage, singlePageRef.current, effectiveScale).catch(console.error)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [pdfDoc, effectiveScale, continuousMode, scale, currentPage])

  // When switching from single-page to continuous mode, re-observe all containers
  // (handled by the IntersectionObserver effect above via continuousMode dependency)

  // Double-click: find the selected/clicked text in .tex source files and open
  const handlePageClick = useCallback(async (pageNum: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.detail < 2) return

    // SyncTeX inverse search
    const container = e.currentTarget
    const rect = container.getBoundingClientRect()
    const x = (e.clientX - rect.left) / effectiveScale
    const y = (e.clientY - rect.top) / effectiveScale

    const synctexResult = await window.electronAPI.synctexInverse(pageNum, x, y)
    if (synctexResult) {
      openFile(synctexResult.file)
      setActiveFile(synctexResult.file)
      setTimeout(() => {
        useEditorStore.getState().jumpToLine(synctexResult.line || 1)
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

  const adjustScale = useCallback((delta: number) => {
    setManualScale((prev) => {
      const current = prev ?? scale ?? 1.2
      return Math.max(0.3, Math.min(5, current + delta))
    })
  }, [scale])

  const resetFit = useCallback(() => {
    setManualScale(null)
  }, [])

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

  // Forward SyncTeX: scroll PDF to the position indicated by pendingPdfJump
  useEffect(() => {
    if (!pendingPdfJump || !scrollContainerRef.current) return
    const { page, y } = pendingPdfJump
    clearPdfJump()

    if (continuousMode) {
      // In continuous mode, find the page container and scroll to it + y offset
      const container = pageContainerRefs.current.get(page)
      if (container && scrollContainerRef.current) {
        const scrollEl = scrollContainerRef.current
        const containerTop = container.offsetTop
        const pageHeight = container.offsetHeight || (pageDimensionsRef.current.get(page)?.height ?? 0) * effectiveScaleRef.current
        // y is in PDF points at scale=1; convert to scaled pixels and add container top
        const scaledY = y * effectiveScaleRef.current
        const targetScrollTop = containerTop + Math.min(scaledY, pageHeight) - scrollEl.clientHeight / 2
        scrollEl.scrollTop = Math.max(0, targetScrollTop)
      }
    } else {
      // In single-page mode, switch to the target page and scroll within the page
      setCurrentPage(page)
      requestAnimationFrame(() => {
        if (singlePageRef.current && scrollContainerRef.current) {
          const scaledY = y * effectiveScaleRef.current
          scrollContainerRef.current.scrollTop = Math.max(0, scaledY - scrollContainerRef.current.clientHeight / 2)
        }
      })
    }
  }, [pendingPdfJump, clearPdfJump, continuousMode])

  // Watch for PDF changes
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
                data-page-num={pageNum}
                ref={(el) => {
                  if (el) {
                    pageContainerRefs.current.set(pageNum, el)
                    // Apply placeholder dimensions immediately if available
                    const dims = pageDimensionsRef.current.get(pageNum)
                    if (dims && el.innerHTML === '') {
                      el.style.width = `${dims.width * effectiveScale}px`
                      el.style.height = `${dims.height * effectiveScale}px`
                    }
                    // Re-observe with current observer if it exists
                    if (intersectionObserverRef.current) {
                      intersectionObserverRef.current.observe(el)
                    }
                  } else {
                    pageContainerRefs.current.delete(pageNum)
                  }
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
