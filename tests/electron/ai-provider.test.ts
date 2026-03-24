import { describe, it, expect, vi } from 'vitest'
import { AiProviderManager, AiRequest } from '../../electron/ai-provider'

describe('AiProviderManager', () => {
  it('builds messages array from request params', () => {
    const manager = new AiProviderManager()
    const request: AiRequest = {
      providers: ['claude'],
      systemPrompt: 'You are an assistant',
      context: 'Paper about NLP',
      selectedText: 'This is a sentence.',
      userPrompt: 'Make it better',
      models: { claude: 'claude-sonnet-4-20250514' },
    }
    const messages = manager.buildMessages(request)
    expect(messages.system).toBe('You are an assistant')
    expect(messages.user).toContain('This is a sentence.')
    expect(messages.user).toContain('Make it better')
    expect(messages.user).toContain('Paper about NLP')
  })

  it('formats user message with context, selection, and prompt', () => {
    const manager = new AiProviderManager()
    const request: AiRequest = {
      providers: ['claude'],
      systemPrompt: 'sys',
      context: 'Context here',
      selectedText: 'Selected here',
      userPrompt: 'Improve this',
      models: {},
    }
    const messages = manager.buildMessages(request)
    expect(messages.user).toContain('Context here')
    expect(messages.user).toContain('Selected here')
    expect(messages.user).toContain('Improve this')
  })

  it('returns provider list from request', () => {
    const manager = new AiProviderManager()
    expect(manager.getProviderIds(['claude', 'openai', 'gemini'])).toEqual(['claude', 'openai', 'gemini'])
  })
})
