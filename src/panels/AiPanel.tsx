import React, { useCallback, useEffect, useState } from 'react'
import { IDockviewPanelProps } from 'dockview-react'
import { useEditorStore } from '../stores/editor-store'
import { useAiStore } from '../stores/ai-store'
import { useSettingsStore } from '../stores/settings-store'
import { ProviderBadge } from '../components/ProviderBadge'
import { PromptInput } from '../components/PromptInput'
import { DiffView } from '../components/DiffView'

export const AiPanel: React.FC<IDockviewPanelProps> = () => {
  const { selection } = useEditorStore()
  const replaceSelection = useEditorStore((s) => s.replaceSelection)
  const { results, isLoading, selectedProviders, startRequest, appendChunk, finishProvider, setSelectedProviders } = useAiStore()
  const { systemPrompt, contextScope, models, contextTemplate } = useSettingsStore()
  const [showDiff, setShowDiff] = useState<Record<string, boolean>>({})

  // Listen for AI streaming events (with cleanup to avoid listener leaks)
  // Use refs to avoid re-registering the listener on every render
  useEffect(() => {
    const cleanup = window.electronAPI.onAiStream((data) => {
      if (data.type === 'done') {
        useAiStore.getState().finishProvider(data.provider)
      } else if (data.type === 'error') {
        useAiStore.getState().finishProvider(data.provider, data.error)
      } else if (data.type === 'delta') {
        useAiStore.getState().appendChunk(data.provider, data.text ?? '')
      }
    })
    return cleanup
  }, [])

  const handleSend = useCallback(async (userPrompt: string) => {
    if (!selection) return

    startRequest(selectedProviders)

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
        selectedText: selection.text,
        userPrompt,
        models,
      })
    } catch (err: any) {
      // If the IPC call itself fails, mark all providers as done with error
      for (const p of selectedProviders) {
        useAiStore.getState().finishProvider(p, err.message || 'Request failed')
      }
    }
  }, [selection, selectedProviders, systemPrompt, contextScope, contextTemplate, models, startRequest])

  const handleApply = useCallback((text: string) => {
    replaceSelection(text)
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
      {selection ? (
        <div style={{ background: '#252540', borderRadius: 6, padding: 8, fontSize: 11 }}>
          <div style={{ color: '#6c9', fontSize: 10, marginBottom: 4 }}>Selected text:</div>
          <div style={{ color: '#aaa', fontStyle: 'italic', maxHeight: 80, overflow: 'auto' }}>
            "{selection.text.length > 200 ? selection.text.slice(0, 200) + '...' : selection.text}"
          </div>
        </div>
      ) : (
        <div style={{ color: '#666', fontSize: 12 }}>Select text in the editor or PDF to get started</div>
      )}

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

      {/* Prompt input */}
      <PromptInput onSubmit={handleSend} disabled={isLoading} />
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
                  onClick={() => {
                    // Retry just this provider with the last prompt
                    // Re-send via the same handleSend mechanism
                  }}
                  style={{ background: '#c66', color: '#fff', border: 'none', padding: '2px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer', marginTop: 4 }}
                >
                  Retry
                </button>
              </div>
            ) : showDiff[result.provider] && selection ? (
              <DiffView original={selection.text} suggested={result.text} />
            ) : (
              <div style={{ color: '#ccc', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {result.text || (result.done ? '(empty response)' : '⏳ Generating...')}
              </div>
            )}

            {result.done && !result.error && (
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                <button
                  onClick={() => handleApply(result.text)}
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
