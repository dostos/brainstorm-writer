import { describe, it, expect, beforeEach } from 'vitest'
import { SettingsManager } from '../../electron/settings-manager'

describe('SettingsManager', () => {
  let settings: SettingsManager

  beforeEach(() => {
    settings = new SettingsManager({ testing: true })
  })

  it('returns default settings when empty', () => {
    const all = settings.getAll()
    expect(all.systemPrompt).toContain('academic')
    expect(all.contextScope).toBe('section')
    expect(all.timeout).toBe(60000)
  })

  it('sets and gets a setting', () => {
    settings.set({ contextScope: 'full' })
    expect(settings.getAll().contextScope).toBe('full')
  })

  it('stores and retrieves API keys', () => {
    settings.setApiKey('claude', 'sk-test-123')
    const keys = settings.getApiKeys()
    expect(keys.claude).toBe('sk-test-123')
  })

  it('falls back to environment variables for API keys', () => {
    process.env.ANTHROPIC_API_KEY = 'env-key-123'
    const keys = settings.getApiKeys()
    expect(keys.claude).toBe('env-key-123')
    delete process.env.ANTHROPIC_API_KEY
  })

  it('prefers stored key over env var', () => {
    process.env.ANTHROPIC_API_KEY = 'env-key'
    settings.setApiKey('claude', 'stored-key')
    const keys = settings.getApiKeys()
    expect(keys.claude).toBe('stored-key')
    delete process.env.ANTHROPIC_API_KEY
  })

  it('stores saved prompts', () => {
    settings.set({ savedPrompts: ['Make concise', 'Add citations'] })
    expect(settings.getAll().savedPrompts).toEqual(['Make concise', 'Add citations'])
  })

  it('stores model selections per provider', () => {
    settings.set({ models: { claude: 'claude-sonnet-4-20250514', openai: 'gpt-4o' } })
    expect(settings.getAll().models.claude).toBe('claude-sonnet-4-20250514')
  })
})
