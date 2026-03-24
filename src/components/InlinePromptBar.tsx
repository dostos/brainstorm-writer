import React, { useState, useRef, useEffect } from 'react'
import { useSettingsStore } from '../stores/settings-store'

interface InlinePromptBarProps {
  selectedText: string
  onSubmit: (prompt: string) => void
  onCancel: () => void
}

export function InlinePromptBar({ selectedText, onSubmit, onCancel }: InlinePromptBarProps) {
  const [prompt, setPrompt] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { savedPrompts } = useSettingsStore()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (prompt.trim()) onSubmit(prompt.trim())
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div style={{
      background: '#252540',
      border: '1px solid #3a3a5e',
      borderRadius: 6,
      padding: '6px 8px',
      margin: '4px 0',
      display: 'flex',
      gap: 6,
      alignItems: 'center',
    }}>
      <span style={{ color: '#6c9', fontSize: 12, flexShrink: 0 }}>AI:</span>
      {savedPrompts.length > 0 && (
        <select
          onChange={(e) => { if (e.target.value) setPrompt(e.target.value) }}
          value=""
          style={{
            background: '#1e1e2e', color: '#ccc', border: '1px solid #444',
            borderRadius: 3, padding: '2px 4px', fontSize: 11, flexShrink: 0,
          }}
        >
          <option value="">Quick...</option>
          {savedPrompts.map((p) => <option key={p} value={p}>{p.slice(0, 30)}</option>)}
        </select>
      )}
      <input
        ref={inputRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type instruction... (Enter to send, Esc to cancel)"
        style={{
          flex: 1,
          background: '#1e1e2e',
          color: '#ccc',
          border: '1px solid #444',
          borderRadius: 3,
          padding: '4px 8px',
          fontSize: 12,
          outline: 'none',
        }}
      />
    </div>
  )
}
