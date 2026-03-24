import Store from 'electron-store'
import os from 'os'
import path from 'path'

export interface Settings {
  systemPrompt: string
  contextTemplate: string
  contextScope: 'selection' | 'section' | 'full'
  savedPrompts: string[]
  models: Record<string, string>
  providerModes: Record<string, 'api' | 'cli'>  // per-provider: use API key or CLI tool
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
  contextTemplate:
    'Paper title: {{title}}\nAuthors: {{authors}}\nSection: {{section}}',
  contextScope: 'section',
  savedPrompts: [
    'Improve clarity and conciseness',
    'Fix grammar and punctuation',
    'Make more formal and academic',
    'Strengthen the argument with smoother transitions',
    'Simplify complex sentences while keeping technical accuracy',
    'Rewrite to be more engaging for the reader',
  ],
  models: {
    claude: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o',
    gemini: 'gemini-2.0-flash',
  },
  providerModes: {
    claude: 'api',
    openai: 'api',
    gemini: 'api',
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
    // B9: if key is falsy, delete the stored key so env var fallback is used
    if (!key) {
      delete keys[provider as keyof StoredKeys]
    } else {
      // In production, encrypt via safeStorage before storing
      keys[provider as keyof StoredKeys] = this.testing ? key : this.encrypt(key)
    }
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

  getWindowBounds(): { width: number; height: number; x?: number; y?: number } {
    return this.store.get('windowBounds') || { width: 1400, height: 900 }
  }

  setWindowBounds(bounds: { width: number; height: number; x: number; y: number }): void {
    this.store.set('windowBounds', bounds)
  }

  getLastProject(): string | null {
    return this.store.get('lastProject') || null
  }

  setLastProject(projectPath: string): void {
    this.store.set('lastProject', projectPath)
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
