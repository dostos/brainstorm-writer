import Store from 'electron-store'
import os from 'os'
import path from 'path'

export interface Settings {
  systemPrompt: string
  contextTemplate: string
  contextScope: 'selection' | 'section' | 'full'
  savedPrompts: string[]
  models: Record<string, string>
  timeout: number
}

interface StoredKeys {
  claude?: string
  openai?: string
  gemini?: string
}

const ENV_KEY_MAP: Record<string, string> = {
  claude: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GOOGLE_API_KEY',
}

const DEFAULTS: Settings = {
  systemPrompt:
    'You are an academic writing assistant. Improve the given text while preserving its meaning and technical accuracy.',
  contextTemplate:
    'Paper title: {{title}}\nAuthors: {{authors}}\nSection: {{section}}',
  contextScope: 'section',
  savedPrompts: [],
  models: {
    claude: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o',
    gemini: 'gemini-2.0-flash',
  },
  timeout: 60000,
}

export class SettingsManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private store: any
  private testing: boolean

  constructor(opts?: { testing?: boolean }) {
    this.testing = opts?.testing ?? false
    const storeOpts: ConstructorParameters<typeof Store>[0] = {
      name: this.testing ? `test-settings-${Date.now()}` : 'settings',
      defaults: {
        settings: { ...DEFAULTS },
        apiKeys: {},
      },
    }

    // In test mode, electron's app is not available so we must provide cwd explicitly
    if (this.testing) {
      storeOpts.cwd = path.join(os.tmpdir(), 'brainstorm-writer-tests')
    }

    this.store = new Store(storeOpts)
  }

  getAll(): Settings {
    return { ...DEFAULTS, ...this.store.get('settings') }
  }

  set(partial: Partial<Settings>): void {
    const current = this.store.get('settings')
    this.store.set('settings', { ...current, ...partial })
  }

  getApiKeys(): StoredKeys {
    const stored = (this.store.get('apiKeys') as StoredKeys) || {}
    const keys: StoredKeys = {}
    for (const [provider, envVar] of Object.entries(ENV_KEY_MAP)) {
      const storedKey = stored[provider as keyof StoredKeys]
      // In production, decrypt stored keys via safeStorage
      keys[provider as keyof StoredKeys] = storedKey
        ? this.testing
          ? storedKey
          : this.decrypt(storedKey)
        : process.env[envVar]
    }
    return keys
  }

  setApiKey(provider: string, key: string): void {
    const keys = (this.store.get('apiKeys') as StoredKeys) || {}
    // In production, encrypt via safeStorage before storing
    keys[provider as keyof StoredKeys] = this.testing ? key : this.encrypt(key)
    this.store.set('apiKeys', keys)
  }

  private encrypt(value: string): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { safeStorage } = require('electron')
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(value).toString('base64')
    }
    return value
  }

  private decrypt(value: string): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { safeStorage } = require('electron')
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(value, 'base64'))
    }
    return value
  }
}
