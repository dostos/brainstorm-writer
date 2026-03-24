import React, { useCallback, useEffect, useRef, useState } from 'react'
import { IDockviewPanelProps } from 'dockview-react'
import { useEditorStore } from '../stores/editor-store'
import { useAiStore } from '../stores/ai-store'
import { useSettingsStore } from '../stores/settings-store'
import { ProviderBadge } from '../components/ProviderBadge'
import { PromptInput } from '../components/PromptInput'
import { DiffView } from '../components/DiffView'

// Parse the structured AI response format:
//   === REVISED ===
//   (revised text)
//   === COMMENTS ===
//   (bullet points)
//   === SUGGESTIONS ===
//   (bullet points)
// Strip markdown code fences (```latex ... ``` or ``` ... ```) from AI output
export function stripCodeFences(text: string): string {
  return text
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/\n?```$/gm, '')
    .trim()
}

export function parseAiResponse(text: string): {
  revised: string
  comments: string
  suggestions: string
  raw: string
} {
  const revisedMatch = text.match(/===\s*REVISED\s*===\s*([\s\S]*?)(?===\s*COMMENTS\s*===|===\s*SUGGESTIONS\s*===|$)/)
  if (!revisedMatch) {
    return { revised: '', comments: '', suggestions: '', raw: stripCodeFences(text) }
  }
  const commentsMatch = text.match(/===\s*COMMENTS\s*===\s*([\s\S]*?)(?===\s*SUGGESTIONS\s*===|===\s*REVISED\s*===|$)/)
  const suggestionsMatch = text.match(/===\s*SUGGESTIONS\s*===\s*([\s\S]*?)(?===\s*COMMENTS\s*===|===\s*REVISED\s*===|$)/)
  return {
    revised: stripCodeFences(revisedMatch[1].trim()),
    comments: commentsMatch ? commentsMatch[1].trim() : '',
    suggestions: suggestionsMatch ? suggestionsMatch[1].trim() : '',
    raw: text,
  }
}

export const AiPanel: React.FC<IDockviewPanelProps> = () => {
  const { selection } = useEditorStore()
  const replaceSelection = useEditorStore((s) => s.replaceSelection)
  const { results, isLoading, selectedProviders, conversationHistory, startRequest, retryProvider, appendChunk, finishProvider, setSelectedProviders, addToHistory, clearHistory } = useAiStore()
  const { systemPrompt, contextScope, models, contextTemplate, providerModes } = useSettingsStore()
  const [showDiff, setShowDiff] = useState<Record<string, boolean>>({})
  const [collapsedSections, setCollapsedSections] = useState<Record<string, { comments?: boolean; suggestions?: boolean }>>({})
  const lastPromptRef = useRef<string>('')
  const lastSelectionRef = useRef<{ text: string; from: number; to: number } | null>(null)

  // Track which provider was first to finish (to add its response to history)
  const firstDoneRef = useRef<string | null>(null)

  // Listen for AI streaming events (with cleanup to avoid listener leaks)
  // Use refs to avoid re-registering the listener on every render
  useEffect(() => {
    const cleanup = window.electronAPI.onAiStream((data) => {
      if (data.type === 'done') {
        const store = useAiStore.getState()
        // Add the first provider's response to conversation history
        if (firstDoneRef.current === null) {
          firstDoneRef.current = data.provider
          const providerResult = store.results[data.provider]
          if (providerResult) {
            store.addToHistory('assistant', providerResult.text)
          }
        }
        store.finishProvider(data.provider)
      } else if (data.type === 'error') {
        useAiStore.getState().finishProvider(data.provider, data.error)
      } else if (data.type === 'delta') {
        useAiStore.getState().appendChunk(data.provider, data.text ?? '')
      }
    })
    return cleanup
  }, [])

  const handleSend = useCallback(async (userPrompt: string) => {
    lastPromptRef.current = userPrompt
    lastSelectionRef.current = selection ? { ...selection } : null
    firstDoneRef.current = null
    startRequest(selectedProviders)

    // Add the user prompt to conversation history
    addToHistory('user', userPrompt)

    // Snapshot history before this turn (does not include the message we just added)
    const history = useAiStore.getState().conversationHistory.slice(0, -1)

    let context = ''
    const { activeFile, openFiles } = useEditorStore.getState()

    if (contextScope === 'section' && activeFile) {
      const content = await window.electronAPI.readFile(activeFile)
      context = content
    } else if (contextScope === 'full') {
      const parts: string[] = []
      for (const file of openFiles) {
        if (file.endsWith('.tex')) {
          const content = await window.electronAPI.readFile(file)
          parts.push(`--- ${file.split('/').pop()} ---\n${content}`)
        }
      }
      context = parts.join('\n\n')
    }
    // contextScope === 'selection' → context stays empty

    // Apply context template with paper metadata placeholders
    // Extract basic metadata from the first .tex file if available
    let formattedContext = contextTemplate
      .replace('{{title}}', extractMetadata(context, 'title'))
      .replace('{{authors}}', extractMetadata(context, 'author'))
      .replace('{{section}}', activeFile?.split('/').pop() || '')

    if (context) {
      formattedContext += '\n\n' + context
    }

    try {
      await window.electronAPI.aiRequest({
        providers: selectedProviders,
        systemPrompt,
        context: formattedContext,
        selectedText: selection?.text ?? '',
        userPrompt,
        models,
        providerModes,
        history,
      })
    } catch (err: any) {
      // If the IPC call itself fails, mark all providers as done with error
      for (const p of selectedProviders) {
        useAiStore.getState().finishProvider(p, err.message || 'Request failed')
      }
    }
  }, [selection, selectedProviders, systemPrompt, contextScope, contextTemplate, models, startRequest, addToHistory])

  const handleApply = useCallback((text: string) => {
    const saved = lastSelectionRef.current
    if (saved) {
      replaceSelection(text, saved.from, saved.to)
    } else {
      replaceSelection(text)
    }
  }, [replaceSelection])

  const toggleProvider = (provider: string) => {
    if (selectedProviders.includes(provider)) {
      if (selectedProviders.length > 1) {
        setSelectedProviders(selectedProviders.filter((p) => p !== provider))
      }
    } else {
      setSelectedProviders([...selectedProviders, provider])
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 12, gap: 10, overflow: 'auto' }}>
      <div style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>AI Assistant</div>

      {/* Selected text display */}
      <div style={{ background: '#252540', borderRadius: 6, padding: 8, fontSize: 11 }}>
        {selection ? (
          <>
            <div style={{ color: '#6c9', fontSize: 10, marginBottom: 4 }}>Selected text:</div>
            <div style={{ color: '#aaa', fontStyle: 'italic', maxHeight: 80, overflow: 'auto' }}>
              "{selection.text.length > 200 ? selection.text.slice(0, 200) + '...' : selection.text}"
            </div>
          </>
        ) : (
          <div style={{ color: '#666', fontSize: 11 }}>No selection — using document context</div>
        )}
      </div>

      {/* Provider selection */}
      <div style={{ display: 'flex', gap: 4 }}>
        {['claude', 'openai', 'gemini'].map((p) => (
          <ProviderBadge
            key={p}
            provider={p}
            selected={selectedProviders.includes(p)}
            onClick={() => toggleProvider(p)}
          />
        ))}
      </div>

      {/* Conversation history indicator + clear button */}
      {conversationHistory.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: '#666', fontSize: 11 }}>
            {Math.floor(conversationHistory.length / 2)} turn{conversationHistory.length > 2 ? 's' : ''} in conversation
          </div>
          <button
            onClick={clearHistory}
            style={{ background: 'transparent', color: '#888', border: '1px solid #444', padding: '2px 8px', borderRadius: 3, fontSize: 11, cursor: 'pointer' }}
          >
            Clear conversation
          </button>
        </div>
      )}

      {/* Prompt input */}
      <PromptInput onSubmit={handleSend} disabled={isLoading} providerCount={selectedProviders.length} />
      {isLoading && (
        <button
          onClick={() => {
            window.electronAPI.cancelAiRequest()
            useAiStore.getState().clearResults()
          }}
          style={{ background: '#c66', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
        >
          Cancel
        </button>
      )}

      {/* Results */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Object.values(results).map((result) => (
          <div key={result.provider} style={{ background: '#252540', borderRadius: 6, padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 6, textTransform: 'capitalize',
              color: result.provider === 'claude' ? '#c49' : result.provider === 'openai' ? '#49c' : '#4c9',
            }}>
              {result.provider}
            </div>

            {result.error ? (
              <div>
                <div style={{ color: '#c66', fontSize: 12 }}>Error: {result.error}</div>
                <button
                  onClick={async () => {
                    const provider = result.provider
                    const userPrompt = lastPromptRef.current
                    if (!userPrompt) return
                    const { selection: currentSelection, activeFile, openFiles } = useEditorStore.getState()
                    const { systemPrompt: sp, contextScope: cs, models: m, contextTemplate: ct, providerModes: pm } = useSettingsStore.getState()
                    retryProvider(provider)
                    let context = ''
                    if (cs === 'section' && activeFile) {
                      context = await window.electronAPI.readFile(activeFile)
                    } else if (cs === 'full') {
                      const parts: string[] = []
                      for (const file of openFiles) {
                        if (file.endsWith('.tex')) {
                          const content = await window.electronAPI.readFile(file)
                          parts.push(`--- ${file.split('/').pop()} ---\n${content}`)
                        }
                      }
                      context = parts.join('\n\n')
                    }
                    let formattedContext = ct
                      .replace('{{title}}', extractMetadata(context, 'title'))
                      .replace('{{authors}}', extractMetadata(context, 'author'))
                      .replace('{{section}}', activeFile?.split('/').pop() || '')
                    if (context) formattedContext += '\n\n' + context
                    const retryHistory = useAiStore.getState().conversationHistory
                    try {
                      await window.electronAPI.aiRequest({
                        providers: [provider],
                        systemPrompt: sp,
                        context: formattedContext,
                        selectedText: currentSelection?.text ?? '',
                        userPrompt,
                        models: m,
                        providerModes: pm,
                        history: retryHistory,
                      })
                    } catch (err: any) {
                      useAiStore.getState().finishProvider(provider, err.message || 'Request failed')
                    }
                  }}
                  style={{ background: '#c66', color: '#fff', border: 'none', padding: '2px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer', marginTop: 4 }}
                >
                  Retry
                </button>
              </div>
            ) : (() => {
              const parsed = parseAiResponse(result.text)
              const isStructured = Boolean(parsed.revised)
              const providerCollapsed = collapsedSections[result.provider] || {}

              if (showDiff[result.provider] && selection) {
                const diffTarget = isStructured ? parsed.revised : result.text
                return <DiffView original={selection.text} suggested={diffTarget} />
              }

              if (!result.text && !result.done) {
                return <div style={{ color: '#888', fontSize: 12 }}>Generating...</div>
              }

              if (!isStructured) {
                return (
                  <div style={{ color: '#ccc', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {result.text || (result.done ? '(empty response)' : '')}
                  </div>
                )
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* REVISED section */}
                  {parsed.revised && (
                    <div>
                      <div style={{ color: '#6c9', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Revised</div>
                      <div style={{ color: '#ddd', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: '#1e1e38', borderRadius: 4, padding: '6px 8px' }}>
                        {parsed.revised}
                      </div>
                    </div>
                  )}

                  {/* COMMENTS section */}
                  {parsed.comments && (
                    <div>
                      <div
                        onClick={() => setCollapsedSections((s) => ({ ...s, [result.provider]: { ...providerCollapsed, comments: !providerCollapsed.comments } }))}
                        style={{ color: '#999', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, cursor: 'pointer', userSelect: 'none' }}
                      >
                        Comments {providerCollapsed.comments ? '▶' : '▼'}
                      </div>
                      {!providerCollapsed.comments && (
                        <div style={{ color: '#aaa', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                          {parsed.comments}
                        </div>
                      )}
                    </div>
                  )}

                  {/* SUGGESTIONS section */}
                  {parsed.suggestions && (
                    <div>
                      <div
                        onClick={() => setCollapsedSections((s) => ({ ...s, [result.provider]: { ...providerCollapsed, suggestions: !providerCollapsed.suggestions } }))}
                        style={{ color: '#777', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, cursor: 'pointer', userSelect: 'none' }}
                      >
                        Suggestions {providerCollapsed.suggestions ? '▶' : '▼'}
                      </div>
                      {!providerCollapsed.suggestions && (
                        <div style={{ color: '#888', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                          {parsed.suggestions}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {result.done && !result.error && (
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                <button
                  onClick={() => {
                    const parsed = parseAiResponse(result.text)
                    handleApply(parsed.revised || result.text)
                  }}
                  style={{ background: '#4a4', color: '#fff', border: 'none', padding: '2px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer' }}
                >
                  Apply
                </button>
                <button
                  onClick={() => setShowDiff((s) => ({ ...s, [result.provider]: !s[result.provider] }))}
                  style={{ background: '#444', color: '#ccc', border: 'none', padding: '2px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer' }}
                >
                  {showDiff[result.provider] ? 'Text' : 'Diff'}
                </button>
                <button
                  onClick={() => {
                    const sel = lastSelectionRef.current
                    if (!sel || sel.from < 0) return
                    const parsed = parseAiResponse(result.text)
                    useEditorStore.getState().showInlineDiff({
                      file: useEditorStore.getState().activeFile || '',
                      from: sel.from,
                      to: sel.to,
                      original: sel.text,
                      suggested: stripCodeFences(parsed.revised || result.text),
                      comments: parsed.comments || '',
                      provider: result.provider,
                    })
                  }}
                  style={{ background: '#3a3a5e', color: '#ccc', border: 'none', padding: '2px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer' }}
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Helper to extract LaTeX metadata
function extractMetadata(texContent: string, command: string): string {
  const match = texContent.match(new RegExp(`\\\\${command}\\{([^}]*)\\}`))
  return match?.[1] || ''
}
