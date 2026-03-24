import { create } from 'zustand'

interface AiResult {
  provider: string
  text: string
  done: boolean
  error?: string
}

interface AiState {
  results: Record<string, AiResult>
  isLoading: boolean
  selectedProviders: string[]
  startRequest: (providers: string[]) => void
  appendChunk: (provider: string, chunk: string) => void
  finishProvider: (provider: string, error?: string) => void
  clearResults: () => void
  setSelectedProviders: (providers: string[]) => void
}

export const useAiStore = create<AiState>()((set) => ({
  results: {},
  isLoading: false,
  selectedProviders: ['claude', 'openai', 'gemini'],
  startRequest: (providers) =>
    set({
      isLoading: true,
      results: Object.fromEntries(providers.map((p) => [p, { provider: p, text: '', done: false }])),
    }),
  appendChunk: (provider, chunk) =>
    set((state) => ({
      results: {
        ...state.results,
        [provider]: { ...state.results[provider], text: state.results[provider].text + chunk },
      },
    })),
  finishProvider: (provider, error) =>
    set((state) => {
      const updated = {
        ...state.results,
        [provider]: { ...state.results[provider], done: true, error },
      }
      const allDone = Object.values(updated).every((r) => r.done)
      return { results: updated, isLoading: !allDone }
    }),
  clearResults: () => set({ results: {}, isLoading: false }),
  setSelectedProviders: (providers) => set({ selectedProviders: providers }),
}))
