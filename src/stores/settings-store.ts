import { create } from 'zustand'

interface SettingsState {
  systemPrompt: string
  contextScope: 'selection' | 'section' | 'full'
  savedPrompts: string[]
  models: Record<string, string>
  timeout: number
  setSettings: (settings: Partial<SettingsState>) => void
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  systemPrompt: 'You are an academic writing assistant.',
  contextScope: 'section',
  savedPrompts: [],
  models: { claude: 'claude-sonnet-4-20250514', openai: 'gpt-4o', gemini: 'gemini-2.0-flash' },
  timeout: 60000,
  setSettings: (settings) => set(settings),
}))
