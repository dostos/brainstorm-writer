import React, { useState, useEffect } from 'react'
import { useSettingsStore } from '../stores/settings-store'
import { useAiStore } from '../stores/ai-store'

interface Props {
  onSubmit: (prompt: string) => void
  disabled: boolean
}

export const PromptInput: React.FC<Props> = ({ onSubmit, disabled }) => {
  const [prompt, setPrompt] = useState('')
  const { savedPrompts, contextScope } = useSettingsStore()
  const setSettings = useSettingsStore((s) => s.setSettings)
  const { pendingPrompt, setPendingPrompt } = useAiStore()

  useEffect(() => {
    if (pendingPrompt !== null) {
      setPrompt(pendingPrompt)
      setPendingPrompt(null)
    }
  }, [pendingPrompt, setPendingPrompt])

  const handleSubmit = () => {
    if (prompt.trim()) {
      onSubmit(prompt.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Saved prompts dropdown */}
      {savedPrompts.length > 0 && (
        <select
          onChange={(e) => { if (e.target.value) setPrompt(e.target.value) }}
          style={{ background: '#252540', color: '#ccc', border: '1px solid #444', borderRadius: 4, padding: 4, fontSize: 11 }}
          value=""
        >
          <option value="">Saved prompts...</option>
          {savedPrompts.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      )}

      {/* Context scope selector */}
      <div style={{ display: 'flex', gap: 4, fontSize: 10, color: '#888' }}>
        <span>Context:</span>
        {(['selection', 'section', 'full'] as const).map((scope) => (
          <span
            key={scope}
            onClick={() => setSettings({ contextScope: scope })}
            style={{
              padding: '1px 6px',
              borderRadius: 3,
              cursor: 'pointer',
              background: contextScope === scope ? '#3a3a5e' : 'transparent',
              color: contextScope === scope ? '#6c9' : '#666',
            }}
          >
            {scope}
          </span>
        ))}
      </div>

      {/* Prompt textarea */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Enter your instruction... (Cmd+Enter to send)"
        disabled={disabled}
        style={{
          background: '#1e1e2e',
          color: '#ccc',
          border: '1px solid #444',
          borderRadius: 4,
          padding: 8,
          fontSize: 12,
          minHeight: 60,
          resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />

      <button
        onClick={handleSubmit}
        disabled={disabled || !prompt.trim()}
        style={{
          background: disabled ? '#333' : '#3a3a5e',
          color: disabled ? '#666' : '#fff',
          border: 'none',
          padding: '6px 12px',
          borderRadius: 4,
          cursor: disabled ? 'default' : 'pointer',
          fontSize: 12,
        }}
      >
        {disabled ? 'Generating...' : 'Send to All ▶'}
      </button>
    </div>
  )
}
