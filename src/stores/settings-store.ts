import { create } from 'zustand'

interface SettingsState {
  systemPrompt: string
  contextTemplate: string
  contextScope: 'selection' | 'section' | 'full'
  savedPrompts: string[]
  models: Record<string, string>
  providerModes: Record<string, 'api' | 'cli'>
  timeout: number
  setSettings: (settings: Partial<SettingsState>) => void
  loadFromMain: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  systemPrompt: `You are an expert academic writing editor. Revise and polish English academic text.

Always respond in this exact format:

=== REVISED ===
(The improved text only, ready to copy-paste into the paper)

=== COMMENTS ===
(Brief bullet points explaining what you changed and why)

=== SUGGESTIONS ===
(Optional further improvements the author could consider, e.g. restructuring, adding citations, clarifying claims)

Rules:
- Preserve original meaning and technical accuracy
- Maintain the author's voice
- Improve clarity, conciseness, and flow
- Follow standard academic conventions`,
  contextTemplate: 'Paper title: {{title}}\nAuthors: {{authors}}\nSection: {{section}}',
  contextScope: 'section',
  savedPrompts: [],
  models: { claude: 'claude-sonnet-4-20250514', openai: 'gpt-4o', gemini: 'gemini-2.0-flash' },
  providerModes: { claude: 'api', openai: 'api', gemini: 'api' },
  timeout: 60000,
  setSettings: (settings) => set(settings),
  loadFromMain: async () => {
    const settings = await window.electronAPI.getSettings()
    set(settings)
  },
}))
