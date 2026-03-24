import React, { useEffect, useRef, useCallback, useState } from 'react'
import { IDockviewPanelProps } from 'dockview-react'
import { basicSetup } from 'codemirror'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { StreamLanguage } from '@codemirror/language'
import { search, searchKeymap } from '@codemirror/search'
import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { useEditorStore } from '../stores/editor-store'

// Simple LaTeX syntax highlighting via StreamLanguage
const latexMode = StreamLanguage.define({
  token(stream) {
    if (stream.match(/\\[a-zA-Z@]+/)) return 'keyword'
    if (stream.match(/\{/)) return 'brace'
    if (stream.match(/\}/)) return 'brace'
    if (stream.match(/%.*$/)) return 'comment'
    if (stream.match(/\$[^$]*\$/)) return 'string'
    stream.next()
    return null
  },
})

// Compartment for hot-swapping lineWrapping without rebuilding entire state
const wrapCompartment = new Compartment()

export const Editor: React.FC<IDockviewPanelProps> = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  // Map from file path -> saved EditorState for that file
  const editorStatesRef = useRef<Map<string, EditorState>>(new Map())
  // Map from file path -> scroll position
  const scrollPositionsRef = useRef<Map<string, number>>(new Map())
  const [wordWrap, setWordWrap] = useState(true)
  const [savedFlash, setSavedFlash] = useState<string | null>(null)
  const { activeFile, openFiles, setSelection, setActiveFile, closeFile } = useEditorStore()
  const pendingReplacement = useEditorStore((s) => s.pendingReplacement)
  const clearReplacement = useEditorStore((s) => s.clearReplacement)
  const markDirty = useEditorStore((s) => s.markDirty)
  const markClean = useEditorStore((s) => s.markClean)
  const dirtyFiles = useEditorStore((s) => s.dirtyFiles)
  const jumpToPdf = useEditorStore((s) => s.jumpToPdf)
  const fileContents = useRef<Record<string, string>>({})

  // Keep a ref to activeFile so update listener can access it without stale closures
  const activeFileRef = useRef<string | null>(activeFile)
  activeFileRef.current = activeFile

  // Keep a ref to wordWrap so we can read it from callbacks without stale closures
  const wordWrapRef = useRef(wordWrap)
  wordWrapRef.current = wordWrap

  // Create the single EditorView on mount
  useEffect(() => {
    if (!containerRef.current) return

    const view = new EditorView({
      state: EditorState.create({ doc: '' }),
      parent: containerRef.current,
    })
    editorViewRef.current = view

    return () => {
      view.destroy()
      editorViewRef.current = null
    }
  }, [])

  // Build an EditorState for a given content string (for first open of a file)
  const buildState = useCallback((content: string): EditorState => {
    return EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        oneDark,
        latexMode,
        search(),
        keymap.of(searchKeymap),
        wrapCompartment.of(wordWrapRef.current ? EditorView.lineWrapping : []),
        EditorView.updateListener.of((update) => {
          if (update.selectionSet) {
            const sel = update.state.selection.main
            if (sel.from !== sel.to) {
              const text = update.state.doc.sliceString(sel.from, sel.to)
              setSelection({ text, from: sel.from, to: sel.to })
            } else {
              setSelection(null)
            }
          }
          // Track content changes and mark file dirty
          if (update.docChanged && activeFileRef.current) {
            fileContents.current[activeFileRef.current] = update.state.doc.toString()
            markDirty(activeFileRef.current)
          }
        }),
      ],
    })
  }, [setSelection, markDirty])

  // Switch the view to the given file's state, saving/restoring scroll
  const switchToFile = useCallback((
    file: string,
    previousFile: string | null,
    newState: EditorState
  ) => {
    const view = editorViewRef.current
    if (!view) return

    // Save scroll position of previous file
    if (previousFile) {
      scrollPositionsRef.current.set(previousFile, view.scrollDOM.scrollTop)
    }

    view.setState(newState)

    // Restore scroll position for the target file
    const savedScroll = scrollPositionsRef.current.get(file) ?? 0
    view.scrollDOM.scrollTop = savedScroll
  }, [])

  // Track previous activeFile to know what to save when switching
  const previousActiveFileRef = useRef<string | null>(null)

  // Handle tab switch and first open
  useEffect(() => {
    if (!activeFile) return
    const view = editorViewRef.current
    if (!view) return

    const previousFile = previousActiveFileRef.current

    // Save current view state back to map before switching
    if (previousFile && previousFile !== activeFile) {
      editorStatesRef.current.set(previousFile, view.state)
    }

    previousActiveFileRef.current = activeFile

    // If we already have a state for this file, swap it in
    const existingState = editorStatesRef.current.get(activeFile)
    if (existingState) {
      switchToFile(activeFile, previousFile !== activeFile ? previousFile : null, existingState)
      return
    }

    // First open: load file content then build state
    const loadAndSwitch = async () => {
      let content = fileContents.current[activeFile]
      if (!content) {
        content = await window.electronAPI.readFile(activeFile)
        fileContents.current[activeFile] = content
      }
      const newState = buildState(content)
      editorStatesRef.current.set(activeFile, newState)
      switchToFile(activeFile, previousFile !== activeFile ? previousFile : null, newState)
    }
    loadAndSwitch()
  }, [activeFile, buildState, switchToFile])

  // Hot-swap lineWrapping via Compartment when wordWrap changes
  useEffect(() => {
    const view = editorViewRef.current
    if (!view) return
    view.dispatch({
      effects: wrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    })
    // Also update the stored state for the active file so future switches use updated wrap
    if (activeFile) {
      editorStatesRef.current.set(activeFile, view.state)
    }
  }, [wordWrap, activeFile])

  const handleSave = useCallback(async () => {
    if (!activeFile || !editorViewRef.current) return
    const content = editorViewRef.current.state.doc.toString()
    try {
      await window.electronAPI.writeFile(activeFile, content)
      markClean(activeFile)
      setSavedFlash(activeFile)
      setTimeout(() => setSavedFlash((prev) => (prev === activeFile ? null : prev)), 1500)
    } catch (err) {
      alert(`Failed to save file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [activeFile, markClean])

  useEffect(() => {
    if (pendingReplacement !== null && editorViewRef.current) {
      const sel = useEditorStore.getState().selection
      if (sel) {
        editorViewRef.current.dispatch({
          changes: { from: sel.from, to: sel.to, insert: pendingReplacement },
        })
      }
      clearReplacement()
    }
  }, [pendingReplacement, clearReplacement])

  // Jump to line from PDF double-click
  const pendingJumpLine = useEditorStore((s) => s.pendingJumpLine)
  const clearJump = useEditorStore((s) => s.clearJump)
  useEffect(() => {
    if (pendingJumpLine !== null && editorViewRef.current) {
      const view = editorViewRef.current
      const line = Math.min(pendingJumpLine, view.state.doc.lines)
      const lineInfo = view.state.doc.line(line)
      view.dispatch({
        selection: { anchor: lineInfo.from },
        scrollIntoView: true,
      })
      view.focus()
      clearJump()
    }
  }, [pendingJumpLine, clearJump])

  // Ctrl+S / Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  // Cmd+click: forward SyncTeX — jump from editor line to PDF position
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handler = async (e: MouseEvent) => {
      if (!e.metaKey) return
      const view = editorViewRef.current
      const file = activeFileRef.current
      if (!view || !file) return
      // Get line number at click position
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
      if (pos === null) return
      const lineNum = view.state.doc.lineAt(pos).number
      try {
        const result = await window.electronAPI.synctexForward(file, lineNum)
        if (result) {
          jumpToPdf(result.page, result.y)
        }
      } catch { /* synctex not available */ }
    }
    container.addEventListener('click', handler)
    return () => container.removeEventListener('click', handler)
  }, [jumpToPdf])

  if (openFiles.length === 0) {
    return (
      <div style={{ padding: 20, color: '#666', textAlign: 'center', marginTop: 40 }}>
        Open a file from the Explorer panel
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #333', background: '#16162a' }}>
        {openFiles.map((file) => (
          <div
            key={file}
            onClick={() => setActiveFile(file)}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              cursor: 'pointer',
              color: file === activeFile ? '#6c9' : '#666',
              background: file === activeFile ? '#2a2a3e' : 'transparent',
              borderRight: '1px solid #333',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>{dirtyFiles.has(file) ? '• ' : ''}{file.split('/').pop()}</span>
            {savedFlash === file && (
              <span style={{ color: '#6c9', fontSize: 10, opacity: 1, transition: 'opacity 1.5s' }}>Saved</span>
            )}
            <span
              onClick={(e) => { e.stopPropagation(); closeFile(file) }}
              style={{ color: '#666', fontSize: 14, lineHeight: 1 }}
            >
              ×
            </span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', paddingRight: 8 }}>
          <button
            onClick={() => setWordWrap(!wordWrap)}
            title={wordWrap ? 'Word wrap: ON' : 'Word wrap: OFF'}
            style={{
              background: wordWrap ? '#3a3a5e' : 'transparent',
              color: wordWrap ? '#6c9' : '#666',
              border: '1px solid #444',
              padding: '1px 6px',
              borderRadius: 3,
              fontSize: 10,
              cursor: 'pointer',
            }}
          >
            Wrap
          </button>
        </div>
      </div>
      {/* Editor container */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'auto' }} />
    </div>
  )
}
