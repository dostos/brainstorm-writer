import React, { useEffect, useRef, useCallback, useState } from 'react'
import { IDockviewPanelProps } from 'dockview-react'
import { basicSetup } from 'codemirror'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { StreamLanguage } from '@codemirror/language'
import { search, searchKeymap } from '@codemirror/search'
import { autocompletion, CompletionContext, CompletionResult, snippetCompletion } from '@codemirror/autocomplete'
import { useEditorStore } from '../stores/editor-store'
import { useAiStore } from '../stores/ai-store'
import { useSettingsStore } from '../stores/settings-store'
import { createInlineDiffField, showInlineDiffEffect, clearInlineDiffEffect } from '../editor/inline-diff-field'
import { createInlinePromptField, showPromptBarEffect, hidePromptBarEffect } from '../editor/inline-prompt-field'
import { parseAiResponse, stripCodeFences } from './AiPanel'

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

// wrapCompartment is created per-component instance (see useRef inside component)

// LaTeX command completions using snippetCompletion for tabstop support
// Template syntax: #{N} for tabstops, #{} for cursor after completion
const LATEX_COMMANDS = [
  // Document structure
  snippetCompletion('\\documentclass{#{1}}', { label: '\\documentclass', detail: 'Document class', type: 'keyword' }),
  snippetCompletion('\\usepackage{#{1}}', { label: '\\usepackage', detail: 'Import package', type: 'keyword' }),
  snippetCompletion('\\begin{#{1}}\n\t#{}\n\\end{#{1}}', { label: '\\begin', detail: 'Begin environment', type: 'keyword' }),
  snippetCompletion('\\end{#{1}}', { label: '\\end', detail: 'End environment', type: 'keyword' }),
  { label: '\\maketitle', type: 'keyword', detail: 'Generate title' },
  { label: '\\tableofcontents', type: 'keyword', detail: 'Table of contents' },
  // Sectioning
  snippetCompletion('\\section{#{1}}', { label: '\\section', detail: 'Section heading', type: 'keyword' }),
  snippetCompletion('\\subsection{#{1}}', { label: '\\subsection', detail: 'Subsection heading', type: 'keyword' }),
  snippetCompletion('\\subsubsection{#{1}}', { label: '\\subsubsection', detail: 'Subsubsection heading', type: 'keyword' }),
  snippetCompletion('\\paragraph{#{1}}', { label: '\\paragraph', detail: 'Paragraph heading', type: 'keyword' }),
  snippetCompletion('\\subparagraph{#{1}}', { label: '\\subparagraph', detail: 'Subparagraph heading', type: 'keyword' }),
  snippetCompletion('\\chapter{#{1}}', { label: '\\chapter', detail: 'Chapter heading', type: 'keyword' }),
  snippetCompletion('\\part{#{1}}', { label: '\\part', detail: 'Part heading', type: 'keyword' }),
  // Text formatting
  snippetCompletion('\\textbf{#{1}}', { label: '\\textbf', detail: 'Bold text', type: 'keyword' }),
  snippetCompletion('\\textit{#{1}}', { label: '\\textit', detail: 'Italic text', type: 'keyword' }),
  snippetCompletion('\\emph{#{1}}', { label: '\\emph', detail: 'Emphasized text', type: 'keyword' }),
  snippetCompletion('\\underline{#{1}}', { label: '\\underline', detail: 'Underlined text', type: 'keyword' }),
  snippetCompletion('\\texttt{#{1}}', { label: '\\texttt', detail: 'Typewriter (monospace) text', type: 'keyword' }),
  snippetCompletion('\\textrm{#{1}}', { label: '\\textrm', detail: 'Roman text', type: 'keyword' }),
  snippetCompletion('\\textsf{#{1}}', { label: '\\textsf', detail: 'Sans-serif text', type: 'keyword' }),
  snippetCompletion('\\textsc{#{1}}', { label: '\\textsc', detail: 'Small caps text', type: 'keyword' }),
  snippetCompletion('\\text{#{1}}', { label: '\\text', detail: 'Text in math mode', type: 'keyword' }),
  // References and citations
  snippetCompletion('\\cite{#{1}}', { label: '\\cite', detail: 'Citation', type: 'keyword' }),
  snippetCompletion('\\ref{#{1}}', { label: '\\ref', detail: 'Reference', type: 'keyword' }),
  snippetCompletion('\\label{#{1}}', { label: '\\label', detail: 'Label', type: 'keyword' }),
  snippetCompletion('\\pageref{#{1}}', { label: '\\pageref', detail: 'Page reference', type: 'keyword' }),
  snippetCompletion('\\eqref{#{1}}', { label: '\\eqref', detail: 'Equation reference', type: 'keyword' }),
  snippetCompletion('\\bibitem{#{1}}', { label: '\\bibitem', detail: 'Bibliography item', type: 'keyword' }),
  snippetCompletion('\\bibliography{#{1}}', { label: '\\bibliography', detail: 'Bibliography file', type: 'keyword' }),
  snippetCompletion('\\bibliographystyle{#{1}}', { label: '\\bibliographystyle', detail: 'Bibliography style', type: 'keyword' }),
  // Figures and tables
  snippetCompletion('\\includegraphics[width=#{1}\\linewidth]{#{2}}', { label: '\\includegraphics', detail: 'Include image', type: 'keyword' }),
  snippetCompletion('\\caption{#{1}}', { label: '\\caption', detail: 'Caption', type: 'keyword' }),
  { label: '\\centering', type: 'keyword', detail: 'Center content' },
  { label: '\\hline', type: 'keyword', detail: 'Horizontal line in table' },
  { label: '\\toprule', type: 'keyword', detail: 'Top rule (booktabs)' },
  { label: '\\midrule', type: 'keyword', detail: 'Middle rule (booktabs)' },
  { label: '\\bottomrule', type: 'keyword', detail: 'Bottom rule (booktabs)' },
  snippetCompletion('\\multicolumn{#{1}}{#{2}}{#{3}}', { label: '\\multicolumn', detail: 'Span columns', type: 'keyword' }),
  snippetCompletion('\\multirow{#{1}}{*}{#{2}}', { label: '\\multirow', detail: 'Span rows', type: 'keyword' }),
  // List items
  { label: '\\item', apply: '\\item ', type: 'keyword', detail: 'List item' },
  // Math
  snippetCompletion('\\frac{#{1}}{#{2}}', { label: '\\frac', detail: 'Fraction', type: 'keyword' }),
  snippetCompletion('\\sqrt{#{1}}', { label: '\\sqrt', detail: 'Square root', type: 'keyword' }),
  snippetCompletion('\\sum_{#{1}}^{#{2}}', { label: '\\sum', detail: 'Summation', type: 'keyword' }),
  snippetCompletion('\\int_{#{1}}^{#{2}}', { label: '\\int', detail: 'Integral', type: 'keyword' }),
  snippetCompletion('\\prod_{#{1}}^{#{2}}', { label: '\\prod', detail: 'Product', type: 'keyword' }),
  snippetCompletion('\\lim_{#{1}}', { label: '\\lim', detail: 'Limit', type: 'keyword' }),
  { label: '\\infty', type: 'keyword', detail: 'Infinity symbol' },
  { label: '\\partial', type: 'keyword', detail: 'Partial derivative symbol' },
  { label: '\\nabla', type: 'keyword', detail: 'Nabla/gradient symbol' },
  snippetCompletion('\\mathbb{#{1}}', { label: '\\mathbb', detail: 'Blackboard bold', type: 'keyword' }),
  snippetCompletion('\\mathcal{#{1}}', { label: '\\mathcal', detail: 'Calligraphic font', type: 'keyword' }),
  snippetCompletion('\\mathrm{#{1}}', { label: '\\mathrm', detail: 'Math roman font', type: 'keyword' }),
  snippetCompletion('\\overline{#{1}}', { label: '\\overline', detail: 'Overline', type: 'keyword' }),
  snippetCompletion('\\hat{#{1}}', { label: '\\hat', detail: 'Hat accent', type: 'keyword' }),
  snippetCompletion('\\vec{#{1}}', { label: '\\vec', detail: 'Vector arrow', type: 'keyword' }),
  // Macros
  snippetCompletion('\\newcommand{\\#{1}}{#{2}}', { label: '\\newcommand', detail: 'Define new command', type: 'keyword' }),
  snippetCompletion('\\renewcommand{\\#{1}}{#{2}}', { label: '\\renewcommand', detail: 'Redefine command', type: 'keyword' }),
  snippetCompletion('\\newenvironment{#{1}}{#{2}}{#{3}}', { label: '\\newenvironment', detail: 'Define new environment', type: 'keyword' }),
  // Misc
  snippetCompletion('\\footnote{#{1}}', { label: '\\footnote', detail: 'Footnote', type: 'keyword' }),
  snippetCompletion('\\url{#{1}}', { label: '\\url', detail: 'URL', type: 'keyword' }),
  snippetCompletion('\\href{#{1}}{#{2}}', { label: '\\href', detail: 'Hyperlink', type: 'keyword' }),
  { label: '\\noindent', type: 'keyword', detail: 'Suppress indentation' },
  { label: '\\newline', type: 'keyword', detail: 'New line' },
  { label: '\\linebreak', type: 'keyword', detail: 'Line break' },
  { label: '\\clearpage', type: 'keyword', detail: 'Clear page' },
  { label: '\\newpage', type: 'keyword', detail: 'New page' },
  snippetCompletion('\\vspace{#{1}}', { label: '\\vspace', detail: 'Vertical space', type: 'keyword' }),
  snippetCompletion('\\hspace{#{1}}', { label: '\\hspace', detail: 'Horizontal space', type: 'keyword' }),
  snippetCompletion('\\input{#{1}}', { label: '\\input', detail: 'Input file', type: 'keyword' }),
  snippetCompletion('\\include{#{1}}', { label: '\\include', detail: 'Include file', type: 'keyword' }),
]

const LATEX_ENVIRONMENTS = [
  'equation', 'equation*', 'align', 'align*', 'figure', 'figure*',
  'table', 'tabular', 'itemize', 'enumerate', 'description', 'abstract',
  'document', 'theorem', 'proof', 'lemma', 'definition', 'corollary',
  'lstlisting', 'verbatim', 'minipage', 'center', 'flushleft', 'flushright',
]

function latexCompletions(context: CompletionContext): CompletionResult | null {
  // Match \begin{ to offer environment names
  const beginMatch = context.matchBefore(/\\begin\{[a-zA-Z*]*/)
  if (beginMatch) {
    const prefix = beginMatch.text.slice('\\begin{'.length)
    const from = beginMatch.from + '\\begin{'.length
    return {
      from,
      options: LATEX_ENVIRONMENTS
        .filter((e) => e.startsWith(prefix))
        .map((e) => ({
          label: e,
          apply: e + '}',
          type: 'keyword',
        })),
      validFor: /^[a-zA-Z*]*$/,
    }
  }

  // Match \ for LaTeX commands
  const cmdMatch = context.matchBefore(/\\[a-zA-Z]*/)
  if (cmdMatch) {
    return {
      from: cmdMatch.from,
      options: LATEX_COMMANDS,
      validFor: /^\\[a-zA-Z]*$/,
    }
  }

  return null
}

export const Editor: React.FC<IDockviewPanelProps> = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  // B5: Compartment lives inside component to avoid RangeError on remount
  const wrapCompartmentRef = useRef(new Compartment())
  // Map from file path -> saved EditorState for that file
  const editorStatesRef = useRef<Map<string, EditorState>>(new Map())
  // Map from file path -> scroll position
  const scrollPositionsRef = useRef<Map<string, number>>(new Map())
  const [wordWrap, setWordWrap] = useState(true)
  const [savedFlash, setSavedFlash] = useState<string | null>(null)
  const { activeFile, openFiles, setSelection, setActiveFile, closeFile } = useEditorStore()
  const pendingReplacement = useEditorStore((s) => s.pendingReplacement)
  const replacementRange = useEditorStore((s) => s.replacementRange)
  const clearReplacement = useEditorStore((s) => s.clearReplacement)
  const markDirty = useEditorStore((s) => s.markDirty)
  const markClean = useEditorStore((s) => s.markClean)
  const dirtyFiles = useEditorStore((s) => s.dirtyFiles)
  const jumpToPdf = useEditorStore((s) => s.jumpToPdf)
  const pendingInlineDiff = useEditorStore((s) => s.pendingInlineDiff)
  const fileContents = useRef<Record<string, string>>({})

  // Keep a ref to activeFile so update listener can access it without stale closures
  const activeFileRef = useRef<string | null>(activeFile)
  activeFileRef.current = activeFile

  // Keep a ref to wordWrap so we can read it from callbacks without stale closures
  const wordWrapRef = useRef(wordWrap)
  wordWrapRef.current = wordWrap

  // Build extensions — uses refs to avoid stale closures, no reactive deps
  const buildExtensions = () => [
    basicSetup,
    oneDark,
    latexMode,
    search(),
    keymap.of(searchKeymap),
    wrapCompartmentRef.current.of(wordWrapRef.current ? EditorView.lineWrapping : []),
    autocompletion({ override: [latexCompletions] }),
    EditorView.updateListener.of((update) => {
      if (update.selectionSet) {
        const sel = update.state.selection.main
        if (sel.from !== sel.to) {
          const text = update.state.doc.sliceString(sel.from, sel.to)
          useEditorStore.getState().setSelection({ text, from: sel.from, to: sel.to })
        } else {
          useEditorStore.getState().setSelection(null)
        }
      }
      if (update.docChanged && activeFileRef.current) {
        fileContents.current[activeFileRef.current] = update.state.doc.toString()
        useEditorStore.getState().markDirty(activeFileRef.current)
      }
    }),
    // Inline diff field — accept replaces text + clears decoration; reject just clears
    createInlineDiffField(
      () => {
        const diff = useEditorStore.getState().pendingInlineDiff
        if (diff && editorViewRef.current) {
          editorViewRef.current.dispatch({
            changes: { from: diff.from, to: diff.to, insert: diff.suggested },
            effects: clearInlineDiffEffect.of(undefined),
          })
          useEditorStore.getState().acceptInlineDiff()
          if (activeFileRef.current) {
            useEditorStore.getState().markDirty(activeFileRef.current)
          }
        }
      },
      () => {
        if (editorViewRef.current) {
          editorViewRef.current.dispatch({
            effects: clearInlineDiffEffect.of(undefined),
          })
        }
        useEditorStore.getState().rejectInlineDiff()
      },
    ),
    // Inline prompt field — onSubmit triggers AI request; onCancel hides bar
    createInlinePromptField(
      async (prompt, selectedText) => {
        console.log('[Editor] inline prompt submitted:', prompt, 'text:', selectedText.slice(0, 30))
        editorViewRef.current?.dispatch({ effects: hidePromptBarEffect.of(undefined) })
        await handleInlineAiRequestRef.current(prompt, selectedText)
      },
      () => {
        editorViewRef.current?.dispatch({ effects: hidePromptBarEffect.of(undefined) })
      },
    ),
    // Cmd+K: show inline prompt bar at selection start
    keymap.of([{
      key: 'Mod-k',
      run: (view) => {
        const sel = view.state.selection.main
        console.log('[Editor] Cmd+K pressed, selection:', sel.from, '-', sel.to)
        if (sel.from === sel.to) return false
        const text = view.state.doc.sliceString(sel.from, sel.to)
        view.dispatch({
          effects: showPromptBarEffect.of({ pos: sel.from, selectedText: text }),
        })
        return true
      },
    }]),
    // Tab to accept / Esc to reject inline diff
    keymap.of([
      {
        key: 'Tab',
        run: () => {
          const diff = useEditorStore.getState().pendingInlineDiff
          if (!diff) return false
          const view = editorViewRef.current
          if (view) {
            view.dispatch({
              changes: { from: diff.from, to: diff.to, insert: diff.suggested },
              effects: clearInlineDiffEffect.of(undefined),
            })
            if (activeFileRef.current) {
              useEditorStore.getState().markDirty(activeFileRef.current)
            }
          }
          useEditorStore.getState().acceptInlineDiff()
          return true
        },
      },
      {
        key: 'Escape',
        run: () => {
          const diff = useEditorStore.getState().pendingInlineDiff
          if (!diff) return false
          editorViewRef.current?.dispatch({
            effects: clearInlineDiffEffect.of(undefined),
          })
          useEditorStore.getState().rejectInlineDiff()
          return true
        },
      },
    ]),
  ]

  // Inline AI request handler — ref so buildExtensions can call it without stale closure
  const handleInlineAiRequestRef = useRef(async (_prompt: string, _selectedText: string) => {})

  const handleInlineAiRequest = useCallback(async (prompt: string, selectedText: string) => {
    console.log('[Editor] handleInlineAiRequest called:', prompt)
    const view = editorViewRef.current
    const file = useEditorStore.getState().activeFile
    if (!view || !file) { console.log('[Editor] no view or file, aborting'); return }

    const sel = view.state.selection.main
    const settings = useSettingsStore.getState()
    const providers = useAiStore.getState().selectedProviders
    const provider = providers[0] || 'claude'

    let context = ''
    if (settings.contextScope === 'section') {
      context = view.state.doc.toString()
    }

    useAiStore.getState().startRequest([provider])

    // Subscribe BEFORE sending request — aiRequest awaits until all providers finish,
    // so streaming events arrive during the await, not after
    const unsubscribe = useAiStore.subscribe((state) => {
      const result = state.results[provider]
      if (result?.done && !result.error) {
        unsubscribe()
        const parsed = parseAiResponse(result.text)
        const suggested = stripCodeFences(parsed.revised || result.text)
        const comments = parsed.comments || ''
        console.log('[Editor] AI done, showing inline diff. revised:', suggested.slice(0, 50), 'comments:', comments.slice(0, 50))

        useEditorStore.getState().showInlineDiff({
          file,
          from: sel.from,
          to: sel.to,
          original: selectedText,
          suggested,
          comments,
          provider,
        })

        view.dispatch({
          effects: showInlineDiffEffect.of({
            from: sel.from,
            to: sel.to,
            original: selectedText,
            suggested,
            comments,
            provider,
          }),
        })
      }
    })

    try {
      await window.electronAPI.aiRequest({
        providers: [provider],
        systemPrompt: settings.systemPrompt,
        context,
        selectedText,
        userPrompt: prompt,
        models: settings.models,
        providerModes: settings.providerModes,
      })
    } catch (err: any) {
      unsubscribe()
      useAiStore.getState().finishProvider(provider, err.message || 'Request failed')
    }
  }, [])

  // Keep handleInlineAiRequestRef in sync
  handleInlineAiRequestRef.current = handleInlineAiRequest

  // Mount editor for a specific file — no reactive deps to avoid spurious re-mounts
  const mountEditorRef = useRef((file: string, content: string) => {
    if (!containerRef.current) return

    // Save current state before destroying
    if (editorViewRef.current) {
      const prevFile = previousActiveFileRef.current
      if (prevFile) {
        editorStatesRef.current.set(prevFile, editorViewRef.current.state)
        scrollPositionsRef.current.set(prevFile, editorViewRef.current.scrollDOM.scrollTop)
      }
      editorViewRef.current.destroy()
      editorViewRef.current = null
    }

    const savedState = editorStatesRef.current.get(file)
    const state = savedState ?? EditorState.create({
      doc: content,
      extensions: buildExtensions(),
    })

    const view = new EditorView({ state, parent: containerRef.current })
    editorViewRef.current = view

    const savedScroll = scrollPositionsRef.current.get(file) ?? 0
    requestAnimationFrame(() => { view.scrollDOM.scrollTop = savedScroll })
  })

  // Track previous activeFile
  const previousActiveFileRef = useRef<string | null>(null)

  // Handle tab switch and first open — ONLY depends on activeFile
  useEffect(() => {
    if (!activeFile) return

    previousActiveFileRef.current = activeFile

    // If we have cached content or saved state, mount immediately
    if (editorStatesRef.current.has(activeFile) || fileContents.current[activeFile]) {
      mountEditorRef.current(activeFile, fileContents.current[activeFile] || '')
      return
    }

    // First open: load file content
    const load = async () => {
      const content = await window.electronAPI.readFile(activeFile)
      const currentActive = useEditorStore.getState().activeFile
      if (currentActive !== activeFile) return
      fileContents.current[activeFile] = content
      mountEditorRef.current(activeFile, content)
    }
    load()
  }, [activeFile]) // eslint-disable-line react-hooks/exhaustive-deps

  // Hot-swap lineWrapping via Compartment when wordWrap changes
  useEffect(() => {
    const view = editorViewRef.current
    if (!view) return
    view.dispatch({
      effects: wrapCompartmentRef.current.reconfigure(wordWrap ? EditorView.lineWrapping : []),
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

  // Auto-save dirty files every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!editorViewRef.current) return
      const { dirtyFiles: dirty, markClean: clean } = useEditorStore.getState()
      for (const file of dirty) {
        const content = fileContents.current[file]
        if (content !== undefined) {
          try {
            await window.electronAPI.writeFile(file, content)
            clean(file)
          } catch { /* silently ignore auto-save errors */ }
        }
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (pendingReplacement !== null && editorViewRef.current) {
      const range = replacementRange ?? useEditorStore.getState().selection
      if (range) {
        editorViewRef.current.dispatch({
          changes: { from: range.from, to: range.to, insert: pendingReplacement },
        })
      }
      clearReplacement()
    }
  }, [pendingReplacement, replacementRange, clearReplacement])

  // When pendingInlineDiff is set from outside (e.g. AI Panel "Edit" button),
  // dispatch the showInlineDiffEffect to the current CodeMirror view
  useEffect(() => {
    if (pendingInlineDiff && editorViewRef.current) {
      editorViewRef.current.dispatch({
        effects: showInlineDiffEffect.of({
          from: pendingInlineDiff.from,
          to: pendingInlineDiff.to,
          original: pendingInlineDiff.original,
          suggested: pendingInlineDiff.suggested,
          comments: pendingInlineDiff.comments,
          provider: pendingInlineDiff.provider,
        }),
      })
    }
  }, [pendingInlineDiff])

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
