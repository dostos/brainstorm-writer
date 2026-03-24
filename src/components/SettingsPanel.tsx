import React, { useState, useEffect, useCallback } from 'react'
import { IDockviewPanelProps } from 'dockview-react'
import { useSettingsStore } from '../stores/settings-store'

const PROVIDERS = [
  { id: 'claude', label: 'Claude (Anthropic)', envVar: 'ANTHROPIC_API_KEY' },
  { id: 'openai', label: 'OpenAI', envVar: 'OPENAI_API_KEY' },
  { id: 'gemini', label: 'Gemini (Google)', envVar: 'GOOGLE_API_KEY' },
]

export const SettingsPanel: React.FC<IDockviewPanelProps> = () => {
  const settings = useSettingsStore()
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [newPrompt, setNewPrompt] = useState('')

  useEffect(() => {
    window.electronAPI.getApiKeys().then((keys: Record<string, string>) => setApiKeys(keys || {}))
  }, [])

  const saveApiKey = useCallback(async (provider: string, key: string) => {
    await window.electronAPI.setApiKey(provider, key)
    setApiKeys((prev) => ({ ...prev, [provider]: key }))
  }, [])

  const saveSettings = useCallback(async (partial: Record<string, unknown>) => {
    settings.setSettings(partial)
    await window.electronAPI.setSettings(partial)
  }, [settings])

  const addSavedPrompt = useCallback(() => {
    if (newPrompt.trim()) {
      const updated = [...settings.savedPrompts, newPrompt.trim()]
      saveSettings({ savedPrompts: updated })
      setNewPrompt('')
    }
  }, [newPrompt, settings.savedPrompts, saveSettings])

  const removeSavedPrompt = useCallback((index: number) => {
    const updated = settings.savedPrompts.filter((_, i) => i !== index)
    saveSettings({ savedPrompts: updated })
  }, [settings.savedPrompts, saveSettings])

  const inputStyle = {
    background: '#1e1e2e', color: '#ccc', border: '1px solid #444',
    borderRadius: 4, padding: '6px 8px', fontSize: 12, width: '100%',
  }

  const labelStyle = { color: '#888', fontSize: 11, marginBottom: 4, display: 'block' as const }

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%' }}>
      <h3 style={{ color: '#ccc', marginBottom: 16 }}>Settings</h3>

      {/* Providers — mode, model, API key per provider */}
      <div style={{ marginBottom: 20 }}>
        <h4 style={{ color: '#6c9', fontSize: 13, marginBottom: 8 }}>Providers</h4>
        {PROVIDERS.map((p) => {
          const mode = settings.providerModes?.[p.id] || 'api'
          return (
            <div key={p.id} style={{ background: '#252540', borderRadius: 6, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#ccc', fontSize: 12, fontWeight: 'bold' }}>{p.label}</span>
                {/* Mode toggle */}
                <div style={{ display: 'flex', gap: 2 }}>
                  {(['api', 'cli'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => saveSettings({ providerModes: { ...settings.providerModes, [p.id]: m } })}
                      style={{
                        background: mode === m ? '#3a3a5e' : 'transparent',
                        color: mode === m ? '#6c9' : '#666',
                        border: '1px solid #444',
                        padding: '1px 8px',
                        borderRadius: 3,
                        fontSize: 10,
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              {/* Model */}
              <div style={{ marginBottom: mode === 'api' ? 6 : 0 }}>
                <label style={{ ...labelStyle, marginBottom: 2 }}>Model</label>
                <input
                  value={settings.models[p.id] || ''}
                  onChange={(e) => saveSettings({ models: { ...settings.models, [p.id]: e.target.value } })}
                  placeholder="Model ID"
                  style={{ ...inputStyle, fontSize: 11 }}
                />
              </div>
              {/* API Key — only show in API mode */}
              {mode === 'api' && (
                <div>
                  <label style={{ ...labelStyle, marginBottom: 2 }}>
                    API Key <span style={{ color: '#555' }}>({p.envVar})</span>
                  </label>
                  <input
                    type="password"
                    value={apiKeys[p.id] || ''}
                    onChange={(e) => saveApiKey(p.id, e.target.value)}
                    placeholder={`Enter key or set ${p.envVar}`}
                    style={{ ...inputStyle, fontSize: 11 }}
                  />
                </div>
              )}
              {mode === 'cli' && (
                <div style={{ color: '#888', fontSize: 10, marginTop: 4 }}>
                  Uses <code style={{ color: '#6c9' }}>{p.id === 'openai' ? 'N/A' : p.id}</code> CLI tool
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* System Prompt */}
      <div style={{ marginBottom: 20 }}>
        <h4 style={{ color: '#6c9', fontSize: 13, marginBottom: 8 }}>System Prompt</h4>
        <textarea
          value={settings.systemPrompt}
          onChange={(e) => saveSettings({ systemPrompt: e.target.value })}
          style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
        />
      </div>

      {/* Context Template */}
      <div style={{ marginBottom: 20 }}>
        <h4 style={{ color: '#6c9', fontSize: 13, marginBottom: 8 }}>Context Template</h4>
        <p style={{ color: '#666', fontSize: 10, marginBottom: 4 }}>Placeholders: {'{{title}}, {{authors}}, {{section}}'}</p>
        <textarea
          value={settings.contextTemplate}
          onChange={(e) => saveSettings({ contextTemplate: e.target.value })}
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
        />
      </div>

      {/* Saved Prompts */}
      <div style={{ marginBottom: 20 }}>
        <h4 style={{ color: '#6c9', fontSize: 13, marginBottom: 8 }}>Saved Prompts</h4>
        {settings.savedPrompts.map((prompt, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ color: '#aaa', fontSize: 12, flex: 1 }}>{prompt}</span>
            <span onClick={() => removeSavedPrompt(i)}
              style={{ color: '#666', cursor: 'pointer', fontSize: 14 }}>×</span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          <input value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)}
            placeholder="New saved prompt..." style={{ ...inputStyle, flex: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && addSavedPrompt()}
          />
          <button onClick={addSavedPrompt}
            style={{ background: '#3a3a5e', color: '#ccc', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
            Add
          </button>
        </div>
      </div>

      {/* Timeout */}
      <div>
        <h4 style={{ color: '#6c9', fontSize: 13, marginBottom: 8 }}>Timeout (seconds)</h4>
        <input
          type="number"
          value={settings.timeout / 1000}
          onChange={(e) => saveSettings({ timeout: Number(e.target.value) * 1000 })}
          style={{ ...inputStyle, width: 100 }}
        />
      </div>
    </div>
  )
}
