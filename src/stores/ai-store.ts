import { create } from 'zustand'

interface AiResult {
  provider: string
  text: string
  done: boolean
  error?: string
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AiState {
  results: Record<string, AiResult>
  isLoading: boolean
  selectedProviders: string[]
  conversationHistory: ConversationMessage[]
  pendingPrompt: string | null
  startRequest: (providers: string[]) => void
  retryProvider: (provider: string) => void
  appendChunk: (provider: string, chunk: string) => void
  finishProvider: (provider: string, error?: string) => void
  clearResults: () => void
  setSelectedProviders: (providers: string[]) => void
  addToHistory: (role: 'user' | 'assistant', content: string) => void
  clearHistory: () => void
  setPendingPrompt: (prompt: string | null) => void
}

export const useAiStore = create<AiState>()((set) => ({
  results: {},
  isLoading: false,
  selectedProviders: ['claude', 'openai', 'gemini'],
  conversationHistory: [],
  pendingPrompt: null,
  startRequest: (providers) =>
    set({
      isLoading: true,
      results: Object.fromEntries(providers.map((p) => [p, { provider: p, text: '', done: false }])),
    }),
  retryProvider: (provider) =>
    set((state) => ({
      isLoading: true,
      results: {
        ...state.results,
        [provider]: { provider, text: '', done: false },
      },
    })),
  appendChunk: (provider, chunk) =>
    set((state) => {
      const existing = state.results[provider]
      if (!existing) return state
      return {
        results: {
          ...state.results,
          [provider]: { ...existing, text: existing.text + chunk },
        },
      }
    }),
  finishProvider: (provider, error) =>
    set((state) => {
      if (!state.results[provider]) return state
      const updated = {
        ...state.results,
        [provider]: { ...state.results[provider], done: true, error },
      }
      const allDone = Object.values(updated).every((r) => r.done)
      return { results: updated, isLoading: !allDone }
    }),
  clearResults: () => set({ results: {}, isLoading: false }),
  setSelectedProviders: (providers) => set({ selectedProviders: providers }),
  addToHistory: (role, content) =>
    set((state) => ({
      conversationHistory: [...state.conversationHistory, { role, content }],
    })),
  clearHistory: () => set({ conversationHistory: [] }),
  setPendingPrompt: (prompt) => set({ pendingPrompt: prompt }),
}))
