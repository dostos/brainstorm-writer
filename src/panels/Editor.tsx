import React, { useEffect, useRef, useCallback } from 'react'
import { IDockviewPanelProps } from 'dockview-react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { StreamLanguage } from '@codemirror/language'
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

export const Editor: React.FC<IDockviewPanelProps> = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const { activeFile, openFiles, setSelection, setActiveFile, closeFile } = useEditorStore()
  const pendingReplacement = useEditorStore((s) => s.pendingReplacement)
  const clearReplacement = useEditorStore((s) => s.clearReplacement)
  const fileContents = useRef<Record<string, string>>({})

  // Load file content when active file changes
  useEffect(() => {
    if (!activeFile) return
    if (fileContents.current[activeFile]) {
      updateEditorContent(fileContents.current[activeFile])
      return
    }
    window.electronAPI.readFile(activeFile).then((content) => {
      fileContents.current[activeFile] = content
      updateEditorContent(content)
    })
  }, [activeFile])

  const updateEditorContent = useCallback((content: string) => {
    if (!containerRef.current) return

    if (editorViewRef.current) {
      editorViewRef.current.destroy()
    }

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        oneDark,
        latexMode,
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
          // Track content changes
          if (update.docChanged && activeFile) {
            fileContents.current[activeFile] = update.state.doc.toString()
          }
        }),
      ],
    })

    editorViewRef.current = new EditorView({
      state,
      parent: containerRef.current,
    })
  }, [activeFile, setSelection])

  const handleSave = useCallback(async () => {
    if (!activeFile || !editorViewRef.current) return
    const content = editorViewRef.current.state.doc.toString()
    await window.electronAPI.writeFile(activeFile, content)
  }, [activeFile])

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
      <div style={{ display: 'flex', borderBottom: '1px solid #333', background: '#16162a' }}>
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
            <span>{file.split('/').pop()}</span>
            <span
              onClick={(e) => { e.stopPropagation(); closeFile(file) }}
              style={{ color: '#666', fontSize: 14, lineHeight: 1 }}
            >
              ×
            </span>
          </div>
        ))}
      </div>
      {/* Editor container */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'auto' }} />
    </div>
  )
}
