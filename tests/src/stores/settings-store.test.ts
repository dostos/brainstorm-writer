import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSettingsStore } from '../../../src/stores/settings-store'

const defaultState = {
  systemPrompt: useSettingsStore.getState().systemPrompt,
  contextTemplate: useSettingsStore.getState().contextTemplate,
  contextScope: 'section' as const,
  savedPrompts: [],
  models: { claude: 'claude-sonnet-4-20250514', openai: 'gpt-4o', gemini: 'gemini-2.0-flash' },
  providerModes: { claude: 'api', openai: 'api', gemini: 'api' },
  timeout: 60000,
}

describe('settings-store', () => {
  beforeEach(() => {
    useSettingsStore.setState(defaultState)
  })

  it('setSettings merges partial settings without overwriting unrelated fields', () => {
    useSettingsStore.getState().setSettings({ timeout: 30000 })
    const state = useSettingsStore.getState()
    expect(state.timeout).toBe(30000)
    // Other fields should be unchanged
    expect(state.contextScope).toBe('section')
    expect(state.models.claude).toBe('claude-sonnet-4-20250514')
  })

  it('setSettings can update multiple fields at once', () => {
    useSettingsStore.getState().setSettings({ contextScope: 'full', timeout: 120000 })
    const state = useSettingsStore.getState()
    expect(state.contextScope).toBe('full')
    expect(state.timeout).toBe(120000)
  })

  it('setSettings can update systemPrompt', () => {
    useSettingsStore.getState().setSettings({ systemPrompt: 'My custom prompt' })
    expect(useSettingsStore.getState().systemPrompt).toBe('My custom prompt')
  })

  it('providerModes defaults to api for all providers', () => {
    const { providerModes } = useSettingsStore.getState()
    expect(providerModes.claude).toBe('api')
    expect(providerModes.openai).toBe('api')
    expect(providerModes.gemini).toBe('api')
  })

  it('setSettings can change providerModes for individual providers', () => {
    useSettingsStore.getState().setSettings({
      providerModes: { claude: 'cli', openai: 'api', gemini: 'api' },
    })
    expect(useSettingsStore.getState().providerModes.claude).toBe('cli')
    expect(useSettingsStore.getState().providerModes.openai).toBe('api')
  })

  it('rootTexFile defaults to empty string', () => {
    // The store has rootTexFile as a field (not in interface but set in create)
    const state = useSettingsStore.getState() as any
    expect(state.rootTexFile).toBe('')
  })

  it('loadFromMain calls electronAPI.getSettings and updates state', async () => {
    const mockSettings = {
      timeout: 90000,
      contextScope: 'selection' as const,
      systemPrompt: 'loaded prompt',
    }
    const mockElectronAPI = {
      getSettings: vi.fn().mockResolvedValue(mockSettings),
    }
    // Temporarily assign window.electronAPI
    ;(globalThis as any).window = { electronAPI: mockElectronAPI }

    await useSettingsStore.getState().loadFromMain()

    expect(mockElectronAPI.getSettings).toHaveBeenCalledOnce()
    expect(useSettingsStore.getState().timeout).toBe(90000)
    expect(useSettingsStore.getState().contextScope).toBe('selection')
    expect(useSettingsStore.getState().systemPrompt).toBe('loaded prompt')

    // Cleanup
    delete (globalThis as any).window
  })
})
