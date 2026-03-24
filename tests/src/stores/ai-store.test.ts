import { describe, it, expect, beforeEach } from 'vitest'
import { useAiStore } from '../../../src/stores/ai-store'

describe('ai-store', () => {
  beforeEach(() => {
    useAiStore.getState().clearResults()
  })

  it('initializes results on startRequest', () => {
    useAiStore.getState().startRequest(['claude', 'openai'])
    const state = useAiStore.getState()
    expect(state.isLoading).toBe(true)
    expect(Object.keys(state.results)).toEqual(['claude', 'openai'])
    expect(state.results.claude.text).toBe('')
  })

  it('appends streaming chunks', () => {
    useAiStore.getState().startRequest(['claude'])
    useAiStore.getState().appendChunk('claude', 'Hello ')
    useAiStore.getState().appendChunk('claude', 'world')
    expect(useAiStore.getState().results.claude.text).toBe('Hello world')
  })

  it('marks provider as done and clears loading when all done', () => {
    useAiStore.getState().startRequest(['claude', 'openai'])
    useAiStore.getState().finishProvider('claude')
    expect(useAiStore.getState().isLoading).toBe(true)
    useAiStore.getState().finishProvider('openai')
    expect(useAiStore.getState().isLoading).toBe(false)
  })

  it('stores error on provider failure', () => {
    useAiStore.getState().startRequest(['claude'])
    useAiStore.getState().finishProvider('claude', 'Rate limited')
    expect(useAiStore.getState().results.claude.error).toBe('Rate limited')
  })
})
