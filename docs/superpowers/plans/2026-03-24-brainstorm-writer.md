# Brainstorm Writer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Electron app that lets users edit LaTeX papers paragraph-by-paragraph with simultaneous multi-AI agent suggestions.

**Architecture:** Electron two-process model. Main process handles file I/O, SyncTeX parsing, and AI API calls. Renderer process uses React + dockview for a VS Code-style panel layout with four core panels: file tree, LaTeX editor, PDF viewer, and AI panel. State managed with zustand; IPC via contextBridge.

**Tech Stack:** Electron, React, TypeScript, Vite, dockview, CodeMirror 6, pdfjs-dist, @anthropic-ai/sdk, openai, @google/generative-ai, electron-store, zustand, react-arborist, diff

**Spec:** `docs/superpowers/specs/2026-03-24-brainstorm-writer-design.md`

---

## File Structure

```
brainstorm-writer/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── electron-builder.yml
├── electron/
│   ├── main.ts                  — Electron entry, window creation, IPC handler registration
│   ├── preload.ts               — contextBridge API exposure
│   ├── file-manager.ts          — File I/O: open project, read/write files, watch changes
│   ├── synctex-parser.ts        — Parse .synctex.gz, forward/inverse search
│   ├── ai-provider.ts           — AI provider manager: concurrent requests, streaming
│   └── settings-manager.ts      — electron-store + safeStorage for API keys and prefs
├── src/
│   ├── index.html               — Vite entry HTML
│   ├── main.tsx                  — React entry point
│   ├── App.tsx                   — dockview layout setup, panel registration
│   ├── panels/
│   │   ├── FileTree.tsx          — react-arborist file explorer
│   │   ├── Editor.tsx            — CodeMirror 6 LaTeX editor with tabs
│   │   ├── PdfViewer.tsx         — pdf.js renderer with text selection + SyncTeX
│   │   └── AiPanel.tsx           — Prompt input, provider toggles, result cards
│   ├── stores/
│   │   ├── editor-store.ts      — Active file, selection, cursor state
│   │   ├── ai-store.ts          — AI requests/responses, streaming state
│   │   ├── project-store.ts     — Open project path, file tree data
│   │   └── settings-store.ts    — Settings mirror from main process
│   ├── components/
│   │   ├── DiffView.tsx          — Inline diff (original vs suggestion)
│   │   ├── ProviderBadge.tsx     — Provider name + color indicator
│   │   ├── PromptInput.tsx       — Textarea + saved prompts dropdown + context scope selector
│   │   └── SettingsPanel.tsx     — API keys, model selection, default prompts, prefs
│   └── styles/
│       └── global.css            — Base styles, dark theme
└── tests/
    ├── electron/
    │   ├── file-manager.test.ts
    │   ├── synctex-parser.test.ts
    │   ├── ai-provider.test.ts
    │   └── settings-manager.test.ts
    └── src/
        ├── stores/
        │   ├── editor-store.test.ts
        │   ├── ai-store.test.ts
        │   └── settings-store.test.ts
        └── components/
            └── DiffView.test.ts
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `electron-builder.yml`
- Create: `electron/main.ts`, `electron/preload.ts`
- Create: `src/index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/global.css`

- [ ] **Step 1: Initialize npm project and install dependencies**

```bash
cd /Users/jingyu/dev/brainstorm-writer
npm init -y
npm install electron electron-builder --save-dev
npm install vite @vitejs/plugin-react typescript --save-dev
npm install react react-dom
npm install @anthropic-ai/sdk openai @google/generative-ai
npm install electron-store
npm install zustand
npm install dockview dockview-react
npm install codemirror @codemirror/view @codemirror/state @codemirror/language @codemirror/theme-one-dark @codemirror/autocomplete @codemirror/search @codemirror/commands
npm install concurrently --save-dev
npm install pdfjs-dist
npm install react-arborist
npm install diff
npm install @types/react @types/react-dom @types/diff --save-dev
npm install vitest --save-dev
```

- [ ] **Step 2: Create TypeScript configs**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": ".",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@electron/*": ["electron/*"]
    }
  },
  "include": ["src/**/*", "electron/**/*", "tests/**/*"]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist-electron"
  },
  "include": ["electron/**/*"]
}
```

- [ ] **Step 3: Create Vite config**

`vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
```

- [ ] **Step 4: Create electron-builder config**

`electron-builder.yml`:
```yaml
appId: com.brainstorm-writer.app
productName: Brainstorm Writer
directories:
  output: release
files:
  - dist/**/*
  - dist-electron/**/*
mac:
  target: dmg
win:
  target: nsis
linux:
  target: AppImage
```

- [ ] **Step 5: Create Electron main process entry**

`electron/main.ts`:
```typescript
import { app, BrowserWindow } from 'electron'
import path from 'path'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
```

- [ ] **Step 6: Create preload script**

`electron/preload.ts`:
```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  openProject: () => ipcRenderer.invoke('file:open-project'),
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  readFileBuffer: (filePath: string) => ipcRenderer.invoke('file:read-buffer', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('file:write', filePath, content),
  watchProject: (projectPath: string) => ipcRenderer.invoke('file:watch', projectPath),
  onFileChanged: (callback: (filePath: string) => void) => {
    const handler = (_event: any, filePath: string) => callback(filePath)
    ipcRenderer.on('file:changed', handler)
    return () => ipcRenderer.removeListener('file:changed', handler)
  },

  // SyncTeX
  parseSynctex: (synctexPath: string) => ipcRenderer.invoke('synctex:parse', synctexPath),
  synctexForward: (file: string, line: number) => ipcRenderer.invoke('synctex:forward', file, line),
  synctexInverse: (page: number, x: number, y: number) => ipcRenderer.invoke('synctex:inverse', page, x, y),

  // AI
  aiRequest: (params: {
    providers: string[]
    systemPrompt: string
    context: string
    selectedText: string
    userPrompt: string
    models: Record<string, string>
  }) => ipcRenderer.invoke('ai:request', params),
  onAiStream: (callback: (data: { provider: string; chunk: string; done: boolean; error?: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('ai:stream', handler)
    return () => ipcRenderer.removeListener('ai:stream', handler)
  },
  cancelAiRequest: () => ipcRenderer.invoke('ai:cancel'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: Record<string, unknown>) => ipcRenderer.invoke('settings:set', settings),
  getApiKeys: () => ipcRenderer.invoke('settings:get-keys'),
  setApiKey: (provider: string, key: string) => ipcRenderer.invoke('settings:set-key', provider, key),
})
```

- [ ] **Step 7: Create React entry point and shell App**

`src/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Brainstorm Writer</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/main.tsx"></script>
</body>
</html>
```

`src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

`src/App.tsx`:
```tsx
import React from 'react'

export default function App() {
  return <div style={{ width: '100vw', height: '100vh', background: '#1e1e2e', color: '#ccc' }}>
    <h1 style={{ padding: 20 }}>Brainstorm Writer</h1>
  </div>
}
```

`src/styles/global.css`:
```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1e1e2e;
  color: #ccc;
}
```

- [ ] **Step 8: Add dev scripts to package.json**

Add to `package.json` scripts:
```json
{
  "scripts": {
    "dev": "concurrently \"VITE_DEV_SERVER_URL=http://localhost:5173 vite --config vite.config.ts\" \"tsc -p tsconfig.node.json -w\" \"sleep 3 && VITE_DEV_SERVER_URL=http://localhost:5173 electron dist-electron/main.js\"",
    "build": "tsc -p tsconfig.node.json && vite build --config vite.config.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "main": "dist-electron/main.js"
}
```

- [ ] **Step 9: Verify the app launches**

```bash
npm run build && npm run dev:electron
```

Expected: Electron window opens with "Brainstorm Writer" heading on dark background.

- [ ] **Step 10: Create shared type declaration for electronAPI**

`src/types/electron.d.ts`:
```typescript
export interface ElectronAPI {
  // File operations
  openProject: () => Promise<{ projectPath: string; tree: any[] } | null>
  readFile: (filePath: string) => Promise<string>
  readFileBuffer: (filePath: string) => Promise<ArrayBuffer>
  writeFile: (filePath: string, content: string) => Promise<void>
  watchProject: (projectPath: string) => Promise<void>
  onFileChanged: (callback: (filePath: string) => void) => () => void
  // SyncTeX
  parseSynctex: (path: string) => Promise<any>
  synctexForward: (file: string, line: number) => Promise<any>
  synctexInverse: (page: number, x: number, y: number) => Promise<any>
  // AI
  aiRequest: (params: any) => Promise<void>
  onAiStream: (callback: (data: any) => void) => () => void
  cancelAiRequest: () => Promise<void>
  // Settings
  getSettings: () => Promise<any>
  setSettings: (settings: any) => Promise<void>
  getApiKeys: () => Promise<any>
  setApiKey: (provider: string, key: string) => Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
```

- [ ] **Step 11: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffold Electron + React + Vite project"
```

---

## Task 2: Settings Manager (Main Process)

**Files:**
- Create: `electron/settings-manager.ts`
- Create: `tests/electron/settings-manager.test.ts`
- Modify: `electron/main.ts` — register IPC handlers

- [ ] **Step 1: Write the failing test**

`tests/electron/settings-manager.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/electron/settings-manager.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement SettingsManager**

`electron/settings-manager.ts`:
```typescript
import Store from 'electron-store'

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
  systemPrompt: 'You are an academic writing assistant. Improve the given text while preserving its meaning and technical accuracy.',
  contextTemplate: 'Paper title: {{title}}\nAuthors: {{authors}}\nSection: {{section}}',
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
  private store: Store<{ settings: Settings; apiKeys: StoredKeys }>
  private testing: boolean

  constructor(opts?: { testing?: boolean }) {
    this.testing = opts?.testing ?? false
    this.store = new Store({
      name: this.testing ? `test-settings-${Date.now()}` : 'settings',
      defaults: {
        settings: { ...DEFAULTS },
        apiKeys: {},
      },
    })
  }

  getAll(): Settings {
    return { ...DEFAULTS, ...this.store.get('settings') }
  }

  set(partial: Partial<Settings>): void {
    const current = this.store.get('settings')
    this.store.set('settings', { ...current, ...partial })
  }

  getApiKeys(): StoredKeys {
    const stored = this.store.get('apiKeys') || {}
    const keys: StoredKeys = {}
    for (const [provider, envVar] of Object.entries(ENV_KEY_MAP)) {
      const storedKey = stored[provider as keyof StoredKeys]
      // In production, decrypt stored keys via safeStorage
      keys[provider as keyof StoredKeys] = storedKey
        ? (this.testing ? storedKey : this.decrypt(storedKey))
        : process.env[envVar]
    }
    return keys
  }

  setApiKey(provider: string, key: string): void {
    const keys = this.store.get('apiKeys') || {}
    // In production, encrypt via safeStorage before storing
    keys[provider as keyof StoredKeys] = this.testing ? key : this.encrypt(key)
    this.store.set('apiKeys', keys)
  }

  private encrypt(value: string): string {
    // Uses Electron's safeStorage API (available in main process)
    const { safeStorage } = require('electron')
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(value).toString('base64')
    }
    return value
  }

  private decrypt(value: string): string {
    const { safeStorage } = require('electron')
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(value, 'base64'))
    }
    return value
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/electron/settings-manager.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Register IPC handlers in main.ts**

Add to `electron/main.ts` after imports:
```typescript
import { ipcMain } from 'electron'
import { SettingsManager } from './settings-manager'

const settingsManager = new SettingsManager()
```

Add after `createWindow()`:
```typescript
ipcMain.handle('settings:get', () => settingsManager.getAll())
ipcMain.handle('settings:set', (_e, settings) => settingsManager.set(settings))
ipcMain.handle('settings:get-keys', () => settingsManager.getApiKeys())
ipcMain.handle('settings:set-key', (_e, provider, key) => settingsManager.setApiKey(provider, key))
```

- [ ] **Step 6: Commit**

```bash
git add electron/settings-manager.ts tests/electron/settings-manager.test.ts electron/main.ts
git commit -m "feat: add settings manager with API key storage and env fallback"
```

---

## Task 3: File Manager (Main Process)

**Files:**
- Create: `electron/file-manager.ts`
- Create: `tests/electron/file-manager.test.ts`
- Modify: `electron/main.ts` — register IPC handlers

- [ ] **Step 1: Write the failing test**

`tests/electron/file-manager.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FileManager } from '../../electron/file-manager'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('FileManager', () => {
  let fm: FileManager
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-test-'))
    fm = new FileManager()
    // Create a test LaTeX project
    fs.writeFileSync(path.join(tmpDir, 'main.tex'), '\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}')
    fs.mkdirSync(path.join(tmpDir, 'sections'))
    fs.writeFileSync(path.join(tmpDir, 'sections', 'intro.tex'), '\\section{Introduction}\nSome text.')
  })

  afterEach(() => {
    fm.stopWatching()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('scans a project directory into a tree', async () => {
    const tree = await fm.scanProject(tmpDir)
    expect(tree).toBeDefined()
    const names = tree.map(n => n.name)
    expect(names).toContain('main.tex')
    expect(names).toContain('sections')
  })

  it('reads a file', async () => {
    const content = await fm.readFile(path.join(tmpDir, 'main.tex'))
    expect(content).toContain('\\documentclass')
  })

  it('writes a file', async () => {
    const filePath = path.join(tmpDir, 'new.tex')
    await fm.writeFile(filePath, 'new content')
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content')
  })

  it('detects file changes via watcher', async () => {
    const changes: string[] = []
    fm.watch(tmpDir, (filePath) => changes.push(filePath))
    const target = path.join(tmpDir, 'main.tex')
    fs.writeFileSync(target, 'modified')
    // Wait for fs watcher debounce
    await new Promise(r => setTimeout(r, 300))
    expect(changes.length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/electron/file-manager.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement FileManager**

`electron/file-manager.ts`:
```typescript
import fs from 'fs'
import path from 'path'

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

export class FileManager {
  private watcher: fs.FSWatcher | null = null

  async scanProject(dirPath: string): Promise<FileNode[]> {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    const nodes: FileNode[] = []

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(dirPath, entry.name)
      const node: FileNode = {
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
      }
      if (entry.isDirectory()) {
        node.children = await this.scanProject(fullPath)
      }
      nodes.push(node)
    }

    return nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  async readFile(filePath: string): Promise<string> {
    return fs.readFileSync(filePath, 'utf-8')
  }

  async readFileBuffer(filePath: string): Promise<Buffer> {
    return fs.readFileSync(filePath)
  }

  fileExists(filePath: string): boolean {
    return fs.existsSync(filePath)
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    fs.writeFileSync(filePath, content, 'utf-8')
  }

  watch(dirPath: string, onChange: (filePath: string) => void): void {
    this.stopWatching()
    this.watcher = fs.watch(dirPath, { recursive: true }, (_event, filename) => {
      if (filename) {
        onChange(path.join(dirPath, filename))
      }
    })
  }

  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/electron/file-manager.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Register IPC handlers in main.ts**

Add to `electron/main.ts`:
```typescript
import { dialog } from 'electron'
import { FileManager } from './file-manager'

const fileManager = new FileManager()

ipcMain.handle('file:open-project', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
  if (result.canceled || result.filePaths.length === 0) return null
  const projectPath = result.filePaths[0]
  const tree = await fileManager.scanProject(projectPath)
  return { projectPath, tree }
})

ipcMain.handle('file:read', async (_e, filePath: string) => fileManager.readFile(filePath))
ipcMain.handle('file:read-buffer', async (_e, filePath: string) => fileManager.readFileBuffer(filePath))
ipcMain.handle('file:write', async (_e, filePath: string, content: string) => fileManager.writeFile(filePath, content))

ipcMain.handle('file:watch', async (_e, projectPath: string) => {
  fileManager.watch(projectPath, (filePath) => {
    mainWindow?.webContents.send('file:changed', filePath)
  })
})
```

- [ ] **Step 6: Commit**

```bash
git add electron/file-manager.ts tests/electron/file-manager.test.ts electron/main.ts
git commit -m "feat: add file manager with project scanning and file watching"
```

---

## Task 4: AI Provider Manager (Main Process)

**Files:**
- Create: `electron/ai-provider.ts`
- Create: `tests/electron/ai-provider.test.ts`
- Modify: `electron/main.ts` — register IPC handlers

- [ ] **Step 1: Write the failing test**

`tests/electron/ai-provider.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/electron/ai-provider.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement AiProviderManager**

`electron/ai-provider.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { BrowserWindow } from 'electron'

export interface AiRequest {
  providers: string[]
  systemPrompt: string
  context: string
  selectedText: string
  userPrompt: string
  models: Record<string, string>
}

interface BuiltMessages {
  system: string
  user: string
}

export class AiProviderManager {
  private abortControllers: AbortController[] = []

  buildMessages(request: AiRequest): BuiltMessages {
    const userParts = []
    if (request.context) {
      userParts.push(`## Paper Context\n${request.context}`)
    }
    userParts.push(`## Text to Improve\n${request.selectedText}`)
    userParts.push(`## Instruction\n${request.userPrompt}`)

    return {
      system: request.systemPrompt,
      user: userParts.join('\n\n'),
    }
  }

  getProviderIds(providers: string[]): string[] {
    return providers
  }

  async sendToAll(
    request: AiRequest,
    apiKeys: Record<string, string | undefined>,
    window: BrowserWindow,
  ): Promise<void> {
    this.cancelAll()
    const messages = this.buildMessages(request)

    const promises = request.providers.map((provider) =>
      this.sendToProvider(provider, messages, request.models[provider], apiKeys[provider], window),
    )

    await Promise.allSettled(promises)
  }

  private async sendToProvider(
    provider: string,
    messages: BuiltMessages,
    model: string | undefined,
    apiKey: string | undefined,
    window: BrowserWindow,
  ): Promise<void> {
    if (!apiKey) {
      window.webContents.send('ai:stream', {
        provider,
        chunk: '',
        done: true,
        error: `No API key configured for ${provider}`,
      })
      return
    }

    const controller = new AbortController()
    this.abortControllers.push(controller)

    try {
      switch (provider) {
        case 'claude':
          await this.streamClaude(messages, model || 'claude-sonnet-4-20250514', apiKey, controller, window)
          break
        case 'openai':
          await this.streamOpenAI(messages, model || 'gpt-4o', apiKey, controller, window)
          break
        case 'gemini':
          await this.streamGemini(messages, model || 'gemini-2.0-flash', apiKey, controller, window)
          break
        default:
          window.webContents.send('ai:stream', { provider, chunk: '', done: true, error: `Unknown provider: ${provider}` })
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        window.webContents.send('ai:stream', { provider, chunk: '', done: true, error: err.message })
      }
    }
  }

  private async streamClaude(
    messages: BuiltMessages,
    model: string,
    apiKey: string,
    controller: AbortController,
    window: BrowserWindow,
  ): Promise<void> {
    const client = new Anthropic({ apiKey })
    const stream = await client.messages.stream({
      model,
      max_tokens: 4096,
      system: messages.system,
      messages: [{ role: 'user', content: messages.user }],
    }, { signal: controller.signal })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        window.webContents.send('ai:stream', { provider: 'claude', chunk: event.delta.text, done: false })
      }
    }
    window.webContents.send('ai:stream', { provider: 'claude', chunk: '', done: true })
  }

  private async streamOpenAI(
    messages: BuiltMessages,
    model: string,
    apiKey: string,
    controller: AbortController,
    window: BrowserWindow,
  ): Promise<void> {
    const client = new OpenAI({ apiKey })
    const stream = await client.chat.completions.create({
      model,
      stream: true,
      messages: [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user },
      ],
    }, { signal: controller.signal })

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || ''
      if (text) {
        window.webContents.send('ai:stream', { provider: 'openai', chunk: text, done: false })
      }
    }
    window.webContents.send('ai:stream', { provider: 'openai', chunk: '', done: true })
  }

  private async streamGemini(
    messages: BuiltMessages,
    model: string,
    apiKey: string,
    _controller: AbortController,
    window: BrowserWindow,
  ): Promise<void> {
    const genAI = new GoogleGenerativeAI(apiKey)
    const genModel = genAI.getGenerativeModel({ model, systemInstruction: messages.system })
    const result = await genModel.generateContentStream(messages.user)

    for await (const chunk of result.stream) {
      const text = chunk.text()
      if (text) {
        window.webContents.send('ai:stream', { provider: 'gemini', chunk: text, done: false })
      }
    }
    window.webContents.send('ai:stream', { provider: 'gemini', chunk: '', done: true })
  }

  cancelAll(): void {
    for (const controller of this.abortControllers) {
      controller.abort()
    }
    this.abortControllers = []
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/electron/ai-provider.test.ts
```

Expected: All 3 tests PASS (only testing message building, not actual API calls).

- [ ] **Step 5: Register IPC handlers in main.ts**

Add to `electron/main.ts`:
```typescript
import { AiProviderManager } from './ai-provider'

const aiManager = new AiProviderManager()

ipcMain.handle('ai:request', async (_e, params) => {
  const keys = settingsManager.getApiKeys()
  await aiManager.sendToAll(params, keys as Record<string, string | undefined>, mainWindow!)
})

ipcMain.handle('ai:cancel', () => {
  aiManager.cancelAll()
})
```

- [ ] **Step 6: Commit**

```bash
git add electron/ai-provider.ts tests/electron/ai-provider.test.ts electron/main.ts
git commit -m "feat: add AI provider manager with Claude, OpenAI, Gemini streaming"
```

---

## Task 5: SyncTeX Parser (Main Process)

**Files:**
- Create: `electron/synctex-parser.ts`
- Create: `tests/electron/synctex-parser.test.ts`
- Modify: `electron/main.ts` — register IPC handlers

- [ ] **Step 1: Write the failing test**

`tests/electron/synctex-parser.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { SynctexParser, SynctexData } from '../../electron/synctex-parser'

describe('SynctexParser', () => {
  const parser = new SynctexParser()

  const mockData: SynctexData = {
    entries: [
      { page: 1, x: 100, y: 200, width: 400, height: 12, file: 'intro.tex', line: 5 },
      { page: 1, x: 100, y: 220, width: 400, height: 12, file: 'intro.tex', line: 6 },
      { page: 1, x: 100, y: 250, width: 400, height: 12, file: 'method.tex', line: 10 },
      { page: 2, x: 100, y: 100, width: 400, height: 12, file: 'method.tex', line: 25 },
    ],
    files: ['intro.tex', 'method.tex'],
  }

  it('forward search: finds PDF location for a source line', () => {
    const result = parser.forwardSearch(mockData, 'intro.tex', 5)
    expect(result).toBeDefined()
    expect(result!.page).toBe(1)
    expect(result!.y).toBe(200)
  })

  it('inverse search: finds source line for PDF coordinates', () => {
    const result = parser.inverseSearch(mockData, 1, 150, 205)
    expect(result).toBeDefined()
    expect(result!.file).toBe('intro.tex')
    expect(result!.line).toBe(5)
  })

  it('inverse search returns closest match within threshold', () => {
    const result = parser.inverseSearch(mockData, 1, 150, 218)
    expect(result).toBeDefined()
    expect(result!.file).toBe('intro.tex')
    // Should match line 6 (y=220) which is closer than line 5 (y=200)
    expect(result!.line).toBe(6)
  })

  it('returns null for unmatched forward search', () => {
    const result = parser.forwardSearch(mockData, 'nonexistent.tex', 1)
    expect(result).toBeNull()
  })

  it('returns null for unmatched inverse search (wrong page)', () => {
    const result = parser.inverseSearch(mockData, 99, 100, 200)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/electron/synctex-parser.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement SynctexParser**

`electron/synctex-parser.ts`:
```typescript
import fs from 'fs'
import zlib from 'zlib'
import path from 'path'

export interface SynctexEntry {
  page: number
  x: number
  y: number
  width: number
  height: number
  file: string
  line: number
}

export interface SynctexData {
  entries: SynctexEntry[]
  files: string[]
}

interface ForwardResult {
  page: number
  x: number
  y: number
}

interface InverseResult {
  file: string
  line: number
}

export class SynctexParser {
  async parse(synctexPath: string): Promise<SynctexData> {
    let content: string

    if (synctexPath.endsWith('.gz')) {
      const compressed = fs.readFileSync(synctexPath)
      content = zlib.gunzipSync(compressed).toString('utf-8')
    } else {
      content = fs.readFileSync(synctexPath, 'utf-8')
    }

    return this.parseContent(content, path.dirname(synctexPath))
  }

  private parseContent(content: string, basePath: string): SynctexData {
    const lines = content.split('\n')
    const files: string[] = []
    const entries: SynctexEntry[] = []

    let currentPage = 0
    const fileMap: Record<number, string> = {}

    for (const line of lines) {
      // Input file declaration: Input:<id>:<path>
      if (line.startsWith('Input:')) {
        const parts = line.substring(6).split(':')
        const id = parseInt(parts[0], 10)
        const filePath = parts.slice(1).join(':')
        fileMap[id] = filePath
        if (!files.includes(filePath)) files.push(filePath)
      }

      // Page start: {<page>
      if (line.startsWith('{')) {
        currentPage = parseInt(line.substring(1), 10)
      }

      // Horizontal box: h<fileId>,<line>,<column>,<x>,<y>,<width>,<height>,<depth>
      // or node entries with similar format
      if (line.startsWith('h') || line.startsWith('x')) {
        const match = line.match(/^[hx](\d+),(\d+),(-?\d+):(-?\d+),(-?\d+),(-?\d+),(-?\d+),(-?\d+)/)
        if (match) {
          const fileId = parseInt(match[1], 10)
          const lineNum = parseInt(match[2], 10)
          const x = parseInt(match[4], 10)
          const y = parseInt(match[5], 10)
          const width = parseInt(match[6], 10)
          const height = parseInt(match[7], 10)

          if (fileMap[fileId] && lineNum > 0) {
            entries.push({
              page: currentPage,
              x, y, width, height,
              file: fileMap[fileId],
              line: lineNum,
            })
          }
        }
      }
    }

    return { entries, files }
  }

  forwardSearch(data: SynctexData, file: string, line: number): ForwardResult | null {
    const match = data.entries.find(e => e.file === file && e.line === line)
    if (!match) return null
    return { page: match.page, x: match.x, y: match.y }
  }

  inverseSearch(data: SynctexData, page: number, x: number, y: number): InverseResult | null {
    const pageEntries = data.entries.filter(e => e.page === page)
    if (pageEntries.length === 0) return null

    let closest: SynctexEntry | null = null
    let minDist = Infinity

    for (const entry of pageEntries) {
      const dist = Math.abs(entry.y - y) + Math.abs(entry.x - x) * 0.1
      if (dist < minDist) {
        minDist = dist
        closest = entry
      }
    }

    if (!closest) return null
    return { file: closest.file, line: closest.line }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/electron/synctex-parser.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Register IPC handlers in main.ts**

Add to `electron/main.ts`:
```typescript
import { SynctexParser, SynctexData } from './synctex-parser'

const synctexParser = new SynctexParser()
let synctexData: SynctexData | null = null

ipcMain.handle('synctex:parse', async (_e, synctexPath: string) => {
  synctexData = await synctexParser.parse(synctexPath)
  return synctexData
})

ipcMain.handle('synctex:forward', async (_e, file: string, line: number) => {
  if (!synctexData) return null
  return synctexParser.forwardSearch(synctexData, file, line)
})

ipcMain.handle('synctex:inverse', async (_e, page: number, x: number, y: number) => {
  if (!synctexData) return null
  return synctexParser.inverseSearch(synctexData, page, x, y)
})
```

- [ ] **Step 6: Commit**

```bash
git add electron/synctex-parser.ts tests/electron/synctex-parser.test.ts electron/main.ts
git commit -m "feat: add SyncTeX parser with forward and inverse search"
```

---

## Task 6: Zustand Stores (Renderer)

**Files:**
- Create: `src/stores/project-store.ts`, `src/stores/editor-store.ts`, `src/stores/ai-store.ts`, `src/stores/settings-store.ts`
- Create: `tests/src/stores/editor-store.test.ts`, `tests/src/stores/ai-store.test.ts`, `tests/src/stores/settings-store.test.ts`

- [ ] **Step 1: Write failing tests for editor-store**

`tests/src/stores/editor-store.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '../../src/stores/editor-store'

describe('editor-store', () => {
  beforeEach(() => {
    useEditorStore.setState(useEditorStore.getInitialState())
  })

  it('sets active file', () => {
    useEditorStore.getState().setActiveFile('/path/intro.tex')
    expect(useEditorStore.getState().activeFile).toBe('/path/intro.tex')
  })

  it('sets selection', () => {
    useEditorStore.getState().setSelection({ text: 'hello', from: 10, to: 15 })
    expect(useEditorStore.getState().selection?.text).toBe('hello')
  })

  it('tracks open files', () => {
    useEditorStore.getState().openFile('/path/a.tex')
    useEditorStore.getState().openFile('/path/b.tex')
    expect(useEditorStore.getState().openFiles).toEqual(['/path/a.tex', '/path/b.tex'])
  })

  it('does not duplicate open files', () => {
    useEditorStore.getState().openFile('/path/a.tex')
    useEditorStore.getState().openFile('/path/a.tex')
    expect(useEditorStore.getState().openFiles).toEqual(['/path/a.tex'])
  })

  it('closes a file', () => {
    useEditorStore.getState().openFile('/path/a.tex')
    useEditorStore.getState().openFile('/path/b.tex')
    useEditorStore.getState().closeFile('/path/a.tex')
    expect(useEditorStore.getState().openFiles).toEqual(['/path/b.tex'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/src/stores/editor-store.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement all stores**

`src/stores/editor-store.ts`:
```typescript
import { create } from 'zustand'

interface Selection {
  text: string
  from: number
  to: number
}

interface EditorState {
  activeFile: string | null
  openFiles: string[]
  selection: Selection | null
  setActiveFile: (file: string) => void
  setSelection: (selection: Selection | null) => void
  openFile: (file: string) => void
  closeFile: (file: string) => void
}

export const useEditorStore = create<EditorState>()((set) => ({
  activeFile: null,
  openFiles: [],
  selection: null,
  setActiveFile: (file) => set({ activeFile: file }),
  setSelection: (selection) => set({ selection }),
  openFile: (file) =>
    set((state) => ({
      openFiles: state.openFiles.includes(file) ? state.openFiles : [...state.openFiles, file],
      activeFile: file,
    })),
  closeFile: (file) =>
    set((state) => ({
      openFiles: state.openFiles.filter((f) => f !== file),
      activeFile: state.activeFile === file ? state.openFiles.find((f) => f !== file) || null : state.activeFile,
    })),
}))
```

`src/stores/project-store.ts`:
```typescript
import { create } from 'zustand'

interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

interface ProjectState {
  projectPath: string | null
  fileTree: FileNode[]
  setProject: (path: string, tree: FileNode[]) => void
  clearProject: () => void
}

export const useProjectStore = create<ProjectState>()((set) => ({
  projectPath: null,
  fileTree: [],
  setProject: (path, tree) => set({ projectPath: path, fileTree: tree }),
  clearProject: () => set({ projectPath: null, fileTree: [] }),
}))
```

`src/stores/ai-store.ts`:
```typescript
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
```

`src/stores/settings-store.ts`:
```typescript
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
```

- [ ] **Step 4: Write and run ai-store test**

`tests/src/stores/ai-store.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useAiStore } from '../../src/stores/ai-store'

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
```

- [ ] **Step 5: Run all store tests**

```bash
npx vitest run tests/src/stores/
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/stores/ tests/src/stores/
git commit -m "feat: add zustand stores for editor, project, AI, and settings state"
```

---

## Task 7: Dockview Layout + Panel Shell (Renderer)

**Files:**
- Modify: `src/App.tsx` — dockview setup with 4 panel placeholders
- Create: `src/panels/FileTree.tsx` (placeholder)
- Create: `src/panels/Editor.tsx` (placeholder)
- Create: `src/panels/PdfViewer.tsx` (placeholder)
- Create: `src/panels/AiPanel.tsx` (placeholder)

- [ ] **Step 1: Install dockview CSS dependency**

Ensure `dockview` is installed (done in Task 1). No additional install needed.

- [ ] **Step 2: Create panel placeholder components**

`src/panels/FileTree.tsx`:
```tsx
import React from 'react'
import { IDockviewPanelProps } from 'dockview-react'

export const FileTree: React.FC<IDockviewPanelProps> = () => {
  return (
    <div style={{ padding: 12, height: '100%', overflow: 'auto' }}>
      <div style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Explorer</div>
      <div style={{ color: '#aaa' }}>Open a project to browse files</div>
    </div>
  )
}
```

`src/panels/Editor.tsx`:
```tsx
import React from 'react'
import { IDockviewPanelProps } from 'dockview-react'

export const Editor: React.FC<IDockviewPanelProps> = () => {
  return (
    <div style={{ padding: 12, height: '100%' }}>
      <div style={{ color: '#aaa' }}>No file open</div>
    </div>
  )
}
```

`src/panels/PdfViewer.tsx`:
```tsx
import React from 'react'
import { IDockviewPanelProps } from 'dockview-react'

export const PdfViewer: React.FC<IDockviewPanelProps> = () => {
  return (
    <div style={{ padding: 12, height: '100%' }}>
      <div style={{ color: '#aaa' }}>No PDF loaded</div>
    </div>
  )
}
```

`src/panels/AiPanel.tsx`:
```tsx
import React from 'react'
import { IDockviewPanelProps } from 'dockview-react'

export const AiPanel: React.FC<IDockviewPanelProps> = () => {
  return (
    <div style={{ padding: 12, height: '100%' }}>
      <div style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>AI Assistant</div>
      <div style={{ color: '#aaa' }}>Select text in the editor or PDF to get started</div>
    </div>
  )
}
```

- [ ] **Step 3: Implement dockview layout in App.tsx**

`src/App.tsx`:
```tsx
import React, { useCallback } from 'react'
import { DockviewReact, DockviewReadyEvent, IDockviewPanelProps } from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import { FileTree } from './panels/FileTree'
import { Editor } from './panels/Editor'
import { PdfViewer } from './panels/PdfViewer'
import { AiPanel } from './panels/AiPanel'

const components: Record<string, React.FC<IDockviewPanelProps>> = {
  fileTree: FileTree,
  editor: Editor,
  pdfViewer: PdfViewer,
  aiPanel: AiPanel,
}

export default function App() {
  const onReady = useCallback((event: DockviewReadyEvent) => {
    const fileTreePanel = event.api.addPanel({
      id: 'fileTree',
      component: 'fileTree',
      title: 'Explorer',
    })

    const editorPanel = event.api.addPanel({
      id: 'editor',
      component: 'editor',
      title: 'Editor',
      position: { referencePanel: fileTreePanel, direction: 'right' },
    })

    event.api.addPanel({
      id: 'pdfViewer',
      component: 'pdfViewer',
      title: 'PDF Preview',
      position: { referencePanel: editorPanel, direction: 'below' },
    })

    event.api.addPanel({
      id: 'aiPanel',
      component: 'aiPanel',
      title: 'AI Assistant',
      position: { referencePanel: editorPanel, direction: 'right' },
    })

    // Set initial sizes (approximate ratios)
    event.api.getGroup(fileTreePanel)?.api.setSize({ width: 200 })
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <DockviewReact
        className="dockview-theme-dark"
        onReady={onReady}
        components={components}
      />
    </div>
  )
}
```

- [ ] **Step 4: Verify the app launches with 4 panels**

```bash
npm run build && npm run dev:electron
```

Expected: Electron window shows 4 dockable panels — Explorer (left), Editor (center top), PDF Preview (center bottom), AI Assistant (right). Panels are draggable and resizable.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/panels/
git commit -m "feat: add dockview layout with 4 panel placeholders"
```

---

## Task 8: File Tree Panel (Renderer)

**Files:**
- Modify: `src/panels/FileTree.tsx` — react-arborist integration
- Uses: `src/stores/project-store.ts`, `src/stores/editor-store.ts`

- [ ] **Step 1: Implement FileTree with react-arborist**

`src/panels/FileTree.tsx`:
```tsx
import React, { useCallback } from 'react'
import { IDockviewPanelProps } from 'dockview-react'
import { Tree, NodeRendererProps } from 'react-arborist'
import { useProjectStore } from '../stores/project-store'
import { useEditorStore } from '../stores/editor-store'
// Type declarations for window.electronAPI are in src/types/electron.d.ts

interface TreeNode {
  id: string
  name: string
  path: string
  isDirectory: boolean
  children?: TreeNode[]
}

function toTreeData(nodes: any[]): TreeNode[] {
  return nodes.map((n) => ({
    id: n.path,
    name: n.name,
    path: n.path,
    isDirectory: n.isDirectory,
    children: n.children ? toTreeData(n.children) : undefined,
  }))
}

function Node({ node, style }: NodeRendererProps<TreeNode>) {
  const icon = node.data.isDirectory ? (node.isOpen ? '📂' : '📁') : '📄'
  return (
    <div
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 4px',
        cursor: 'pointer',
        fontSize: 13,
        color: node.isSelected ? '#6c9' : '#ccc',
      }}
      onClick={() => node.isInternal ? node.toggle() : node.select()}
    >
      <span>{icon}</span>
      <span>{node.data.name}</span>
    </div>
  )
}

export const FileTree: React.FC<IDockviewPanelProps> = () => {
  const { projectPath, fileTree, setProject } = useProjectStore()
  const { openFile } = useEditorStore()

  const handleOpenProject = useCallback(async () => {
    const result = await window.electronAPI.openProject()
    if (result) {
      setProject(result.projectPath, result.tree)
      await window.electronAPI.watchProject(result.projectPath)
    }
  }, [setProject])

  const treeData = toTreeData(fileTree)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
        <button
          onClick={handleOpenProject}
          style={{
            background: '#3a3a5e',
            color: '#ccc',
            border: 'none',
            padding: '4px 12px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
            width: '100%',
          }}
        >
          {projectPath ? 'Change Project' : 'Open Project'}
        </button>
      </div>
      {projectPath && (
        <div style={{ padding: '4px 12px', color: '#888', fontSize: 11, borderBottom: '1px solid #333' }}>
          {projectPath.split('/').pop()}
        </div>
      )}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {treeData.length > 0 && (
          <Tree
            data={treeData}
            openByDefault={false}
            width="100%"
            indent={16}
            rowHeight={24}
            onSelect={(nodes) => {
              const node = nodes[0]
              if (node && !node.data.isDirectory) {
                openFile(node.data.path)
              }
            }}
          >
            {Node}
          </Tree>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify file tree works**

```bash
npm run build && npm run dev:electron
```

Expected: Click "Open Project" → select a LaTeX project folder → file tree renders. Clicking a `.tex` file updates editor store (not visible yet, but state updates).

- [ ] **Step 3: Commit**

```bash
git add src/panels/FileTree.tsx
git commit -m "feat: implement file tree panel with react-arborist"
```

---

## Task 9: LaTeX Editor Panel (Renderer)

**Files:**
- Modify: `src/panels/Editor.tsx` — CodeMirror 6 with LaTeX, tabs, selection tracking

- [ ] **Step 1: Install CodeMirror LaTeX language support**

```bash
npm install @codemirror/language @codemirror/autocomplete @codemirror/search @codemirror/commands @codemirror/lang-markdown @lezer/highlight
```

Note: There is no official `@codemirror/lang-latex`. We will use `StreamLanguage` with a custom LaTeX mode or `@codemirror/lang-markdown` as a base and add LaTeX syntax highlighting via custom highlight rules.

- [ ] **Step 2: Implement Editor panel**

`src/panels/Editor.tsx`:
```tsx
import React, { useEffect, useRef, useCallback } from 'react'
import { IDockviewPanelProps } from 'dockview-react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { StreamLanguage } from '@codemirror/language'
import { useEditorStore } from '../stores/editor-store'

// Simple LaTeX syntax highlighting via StreamLanguage
const latexMode = StreamLanguage.define({
  token(stream) {
    if (stream.match(/\\[a-zA-Z@]+/)) return 'keyword'
    if (stream.match(/\{/)) return 'brace'
    if (stream.match(/\}/)) return 'brace'
    if (stream.match(/%.*$/)) return 'comment'
    if (stream.match(/\$[^$]*\$/)) return 'string'
    stream.next()
    return null
  },
})

export const Editor: React.FC<IDockviewPanelProps> = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const { activeFile, openFiles, setSelection, setActiveFile, closeFile } = useEditorStore()
  const fileContents = useRef<Record<string, string>>({})

  // Load file content when active file changes
  useEffect(() => {
    if (!activeFile) return
    if (fileContents.current[activeFile]) {
      updateEditorContent(fileContents.current[activeFile])
      return
    }
    window.electronAPI.readFile(activeFile).then((content) => {
      fileContents.current[activeFile] = content
      updateEditorContent(content)
    })
  }, [activeFile])

  const updateEditorContent = useCallback((content: string) => {
    if (!containerRef.current) return

    if (editorViewRef.current) {
      editorViewRef.current.destroy()
    }

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        oneDark,
        latexMode,
        EditorView.updateListener.of((update) => {
          if (update.selectionSet) {
            const sel = update.state.selection.main
            if (sel.from !== sel.to) {
              const text = update.state.doc.sliceString(sel.from, sel.to)
              setSelection({ text, from: sel.from, to: sel.to })
            } else {
              setSelection(null)
            }
          }
          // Track content changes
          if (update.docChanged && activeFile) {
            fileContents.current[activeFile] = update.state.doc.toString()
          }
        }),
      ],
    })

    editorViewRef.current = new EditorView({
      state,
      parent: containerRef.current,
    })
  }, [activeFile, setSelection])

  const handleSave = useCallback(async () => {
    if (!activeFile || !editorViewRef.current) return
    const content = editorViewRef.current.state.doc.toString()
    await window.electronAPI.writeFile(activeFile, content)
  }, [activeFile])

  // Ctrl+S / Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  if (openFiles.length === 0) {
    return (
      <div style={{ padding: 20, color: '#666', textAlign: 'center', marginTop: 40 }}>
        Open a file from the Explorer panel
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #333', background: '#16162a' }}>
        {openFiles.map((file) => (
          <div
            key={file}
            onClick={() => setActiveFile(file)}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              cursor: 'pointer',
              color: file === activeFile ? '#6c9' : '#666',
              background: file === activeFile ? '#2a2a3e' : 'transparent',
              borderRight: '1px solid #333',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>{file.split('/').pop()}</span>
            <span
              onClick={(e) => { e.stopPropagation(); closeFile(file) }}
              style={{ color: '#666', fontSize: 14, lineHeight: 1 }}
            >
              ×
            </span>
          </div>
        ))}
      </div>
      {/* Editor container */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'auto' }} />
    </div>
  )
}
```

- [ ] **Step 3: Verify editor works**

```bash
npm run build && npm run dev:electron
```

Expected: Open project → click a `.tex` file → CodeMirror editor opens with LaTeX syntax highlighting, tabs work, text selection updates store.

- [ ] **Step 4: Commit**

```bash
git add src/panels/Editor.tsx
git commit -m "feat: implement LaTeX editor panel with CodeMirror 6, tabs, and selection tracking"
```

---

## Task 10: PDF Viewer Panel (Renderer)

**Files:**
- Modify: `src/panels/PdfViewer.tsx` — pdf.js rendering with text selection

- [ ] **Step 1: Implement PDF viewer**

`src/panels/PdfViewer.tsx`:
```tsx
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { IDockviewPanelProps } from 'dockview-react'
import * as pdfjsLib from 'pdfjs-dist'
import { useProjectStore } from '../stores/project-store'
import { useEditorStore } from '../stores/editor-store'

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

export const PdfViewer: React.FC<IDockviewPanelProps> = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1.2)
  const { projectPath } = useProjectStore()
  const { openFile, setActiveFile } = useEditorStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Find and load PDF in project via IPC (avoids file:// CSP issues)
  const loadPdf = useCallback(async () => {
    if (!projectPath) return
    const candidates = ['main.pdf', 'output.pdf', 'paper.pdf']
    for (const name of candidates) {
      const pdfPath = `${projectPath}/${name}`
      try {
        const buffer = await window.electronAPI.readFileBuffer(pdfPath)
        if (buffer) {
          const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
          setPdfDoc(doc)
          setTotalPages(doc.numPages)
          setCurrentPage(1)
          return
        }
      } catch { /* not found, try next */ }
    }
  }, [projectPath])

  // Load PDF
  useEffect(() => {
    loadPdf().catch(console.error)
  }, [loadPdf])

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    pdfDoc.getPage(currentPage).then((page) => {
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current!
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      page.render({ canvasContext: ctx, viewport })
    })
  }, [pdfDoc, currentPage, scale])

  // Handle text selection in PDF for SyncTeX
  const handleCanvasClick = useCallback(async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale

    const result = await window.electronAPI.synctexInverse(currentPage, x, y)
    if (result) {
      openFile(result.file)
      setActiveFile(result.file)
      // Editor will handle jumping to the line via a separate mechanism
    }
  }, [currentPage, scale, openFile, setActiveFile])

  // Watch for PDF changes and reload via IPC buffer
  useEffect(() => {
    const cleanup = window.electronAPI.onFileChanged((filePath: string) => {
      if (filePath.endsWith('.pdf')) {
        loadPdf().catch(console.error)
      }
    })
    return cleanup
  }, [loadPdf])

  if (!projectPath) {
    return (
      <div style={{ padding: 20, color: '#666', textAlign: 'center', marginTop: 40 }}>
        Open a project to view PDF
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '4px 8px', borderBottom: '1px solid #333', fontSize: 12, color: '#888',
      }}>
        <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}
          style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>◀</button>
        <span>Page {currentPage} / {totalPages}</span>
        <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages}
          style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>▶</button>
        <span style={{ margin: '0 8px' }}>|</span>
        <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
          style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>−</button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(3, s + 0.1))}
          style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}>+</button>
      </div>
      {/* PDF canvas */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: 12 }}>
        <canvas ref={canvasRef} onClick={handleCanvasClick} style={{ cursor: 'crosshair' }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify PDF viewer works**

```bash
npm run build && npm run dev:electron
```

Expected: Open a LaTeX project with a compiled PDF → PDF renders in the viewer panel. Page navigation and zoom work. Clicking on PDF attempts SyncTeX inverse search.

- [ ] **Step 3: Commit**

```bash
git add src/panels/PdfViewer.tsx
git commit -m "feat: implement PDF viewer panel with pdf.js, navigation, zoom, and SyncTeX click"
```

---

## Task 11: AI Panel (Renderer)

**Files:**
- Modify: `src/panels/AiPanel.tsx` — prompt input, provider toggles, streaming results
- Create: `src/components/PromptInput.tsx`
- Create: `src/components/ProviderBadge.tsx`
- Create: `src/components/DiffView.tsx`

- [ ] **Step 1: Create ProviderBadge component**

`src/components/ProviderBadge.tsx`:
```tsx
import React from 'react'

const COLORS: Record<string, string> = {
  claude: '#c49',
  openai: '#49c',
  gemini: '#4c9',
}

interface Props {
  provider: string
  selected: boolean
  onClick: () => void
}

export const ProviderBadge: React.FC<Props> = ({ provider, selected, onClick }) => (
  <div
    onClick={onClick}
    style={{
      background: selected ? (COLORS[provider] || '#888') : '#333',
      color: selected ? '#fff' : '#888',
      padding: '3px 10px',
      borderRadius: 3,
      fontSize: 11,
      fontWeight: 'bold',
      cursor: 'pointer',
      textTransform: 'capitalize',
      transition: 'background 0.15s',
    }}
  >
    {provider}
  </div>
)
```

- [ ] **Step 2: Create PromptInput component**

`src/components/PromptInput.tsx`:
```tsx
import React, { useState } from 'react'
import { useSettingsStore } from '../stores/settings-store'

interface Props {
  onSubmit: (prompt: string) => void
  disabled: boolean
}

export const PromptInput: React.FC<Props> = ({ onSubmit, disabled }) => {
  const [prompt, setPrompt] = useState('')
  const { savedPrompts, contextScope } = useSettingsStore()
  const setSettings = useSettingsStore((s) => s.setSettings)

  const handleSubmit = () => {
    if (prompt.trim()) {
      onSubmit(prompt.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Saved prompts dropdown */}
      {savedPrompts.length > 0 && (
        <select
          onChange={(e) => { if (e.target.value) setPrompt(e.target.value) }}
          style={{ background: '#252540', color: '#ccc', border: '1px solid #444', borderRadius: 4, padding: 4, fontSize: 11 }}
          value=""
        >
          <option value="">Saved prompts...</option>
          {savedPrompts.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      )}

      {/* Context scope selector */}
      <div style={{ display: 'flex', gap: 4, fontSize: 10, color: '#888' }}>
        <span>Context:</span>
        {(['selection', 'section', 'full'] as const).map((scope) => (
          <span
            key={scope}
            onClick={() => setSettings({ contextScope: scope })}
            style={{
              padding: '1px 6px',
              borderRadius: 3,
              cursor: 'pointer',
              background: contextScope === scope ? '#3a3a5e' : 'transparent',
              color: contextScope === scope ? '#6c9' : '#666',
            }}
          >
            {scope}
          </span>
        ))}
      </div>

      {/* Prompt textarea */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Enter your instruction... (Cmd+Enter to send)"
        disabled={disabled}
        style={{
          background: '#1e1e2e',
          color: '#ccc',
          border: '1px solid #444',
          borderRadius: 4,
          padding: 8,
          fontSize: 12,
          minHeight: 60,
          resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />

      <button
        onClick={handleSubmit}
        disabled={disabled || !prompt.trim()}
        style={{
          background: disabled ? '#333' : '#3a3a5e',
          color: disabled ? '#666' : '#fff',
          border: 'none',
          padding: '6px 12px',
          borderRadius: 4,
          cursor: disabled ? 'default' : 'pointer',
          fontSize: 12,
        }}
      >
        {disabled ? 'Generating...' : 'Send to All ▶'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Create DiffView component**

`src/components/DiffView.tsx`:
```tsx
import React from 'react'
import { diffWords } from 'diff'

interface Props {
  original: string
  suggested: string
}

export const DiffView: React.FC<Props> = ({ original, suggested }) => {
  const changes = diffWords(original, suggested)

  return (
    <div style={{ fontSize: 12, lineHeight: 1.6, padding: 8, background: '#1a1a2e', borderRadius: 4 }}>
      {changes.map((change, i) => (
        <span
          key={i}
          style={{
            background: change.added ? 'rgba(80,200,120,0.2)' : change.removed ? 'rgba(200,80,80,0.2)' : 'transparent',
            textDecoration: change.removed ? 'line-through' : 'none',
            color: change.added ? '#6c9' : change.removed ? '#c66' : '#ccc',
          }}
        >
          {change.value}
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Write DiffView test**

`tests/src/components/DiffView.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { diffWords } from 'diff'

describe('DiffView logic', () => {
  it('detects word-level changes', () => {
    const changes = diffWords('The quick brown fox', 'The fast brown dog')
    const added = changes.filter(c => c.added).map(c => c.value)
    const removed = changes.filter(c => c.removed).map(c => c.value)
    expect(added).toContain('fast')
    expect(added).toContain('dog')
    expect(removed).toContain('quick')
    expect(removed).toContain('fox')
  })

  it('returns no changes for identical text', () => {
    const changes = diffWords('same text', 'same text')
    expect(changes.every(c => !c.added && !c.removed)).toBe(true)
  })
})
```

- [ ] **Step 5: Run DiffView test**

```bash
npx vitest run tests/src/components/DiffView.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Implement AiPanel**

`src/panels/AiPanel.tsx`:
```tsx
import React, { useCallback, useEffect, useState } from 'react'
import { IDockviewPanelProps } from 'dockview-react'
import { useEditorStore } from '../stores/editor-store'
import { useAiStore } from '../stores/ai-store'
import { useSettingsStore } from '../stores/settings-store'
import { ProviderBadge } from '../components/ProviderBadge'
import { PromptInput } from '../components/PromptInput'
import { DiffView } from '../components/DiffView'

export const AiPanel: React.FC<IDockviewPanelProps> = () => {
  const { selection } = useEditorStore()
  const { results, isLoading, selectedProviders, startRequest, appendChunk, finishProvider, setSelectedProviders } = useAiStore()
  const { systemPrompt, contextScope, models } = useSettingsStore()
  const [showDiff, setShowDiff] = useState<Record<string, boolean>>({})

  // Listen for AI streaming events (with cleanup to avoid listener leaks)
  useEffect(() => {
    const cleanup = window.electronAPI.onAiStream((data) => {
      if (data.done) {
        finishProvider(data.provider, data.error)
      } else {
        appendChunk(data.provider, data.chunk)
      }
    })
    return cleanup
  }, [appendChunk, finishProvider])

  const handleSend = useCallback(async (userPrompt: string) => {
    if (!selection) return

    startRequest(selectedProviders)

    // TODO: build context based on contextScope (for now, send selection only)
    await window.electronAPI.aiRequest({
      providers: selectedProviders,
      systemPrompt,
      context: '', // Will be populated based on contextScope
      selectedText: selection.text,
      userPrompt,
      models,
    })
  }, [selection, selectedProviders, systemPrompt, models, startRequest])

  const handleApply = useCallback((text: string) => {
    // TODO: replace selection in editor with AI result
    console.log('Apply:', text)
  }, [])

  const toggleProvider = (provider: string) => {
    if (selectedProviders.includes(provider)) {
      if (selectedProviders.length > 1) {
        setSelectedProviders(selectedProviders.filter((p) => p !== provider))
      }
    } else {
      setSelectedProviders([...selectedProviders, provider])
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 12, gap: 10, overflow: 'auto' }}>
      <div style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>AI Assistant</div>

      {/* Selected text display */}
      {selection ? (
        <div style={{ background: '#252540', borderRadius: 6, padding: 8, fontSize: 11 }}>
          <div style={{ color: '#6c9', fontSize: 10, marginBottom: 4 }}>Selected text:</div>
          <div style={{ color: '#aaa', fontStyle: 'italic', maxHeight: 80, overflow: 'auto' }}>
            "{selection.text.length > 200 ? selection.text.slice(0, 200) + '...' : selection.text}"
          </div>
        </div>
      ) : (
        <div style={{ color: '#666', fontSize: 12 }}>Select text in the editor or PDF to get started</div>
      )}

      {/* Provider selection */}
      <div style={{ display: 'flex', gap: 4 }}>
        {['claude', 'openai', 'gemini'].map((p) => (
          <ProviderBadge
            key={p}
            provider={p}
            selected={selectedProviders.includes(p)}
            onClick={() => toggleProvider(p)}
          />
        ))}
      </div>

      {/* Prompt input */}
      <PromptInput onSubmit={handleSend} disabled={isLoading || !selection} />

      {/* Results */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Object.values(results).map((result) => (
          <div key={result.provider} style={{ background: '#252540', borderRadius: 6, padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 6, textTransform: 'capitalize',
              color: result.provider === 'claude' ? '#c49' : result.provider === 'openai' ? '#49c' : '#4c9',
            }}>
              {result.provider}
            </div>

            {result.error ? (
              <div>
                <div style={{ color: '#c66', fontSize: 12 }}>Error: {result.error}</div>
                <button
                  onClick={() => {
                    // Retry just this provider with the last prompt
                    // Re-send via the same handleSend mechanism
                  }}
                  style={{ background: '#c66', color: '#fff', border: 'none', padding: '2px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer', marginTop: 4 }}
                >
                  Retry
                </button>
              </div>
            ) : showDiff[result.provider] && selection ? (
              <DiffView original={selection.text} suggested={result.text} />
            ) : (
              <div style={{ color: '#ccc', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {result.text || (result.done ? '(empty response)' : '⏳ Generating...')}
              </div>
            )}

            {result.done && !result.error && (
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                <button
                  onClick={() => handleApply(result.text)}
                  style={{ background: '#4a4', color: '#fff', border: 'none', padding: '2px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer' }}
                >
                  Apply
                </button>
                <button
                  onClick={() => setShowDiff((s) => ({ ...s, [result.provider]: !s[result.provider] }))}
                  style={{ background: '#444', color: '#ccc', border: 'none', padding: '2px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer' }}
                >
                  {showDiff[result.provider] ? 'Text' : 'Diff'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Verify AI panel works end-to-end**

```bash
npm run build && npm run dev:electron
```

Expected: Open project → open `.tex` file → select text → AI panel shows selected text → type prompt → click "Send to All" → streaming results from configured providers appear. Apply/Diff buttons work on completed results.

- [ ] **Step 8: Commit**

```bash
git add src/panels/AiPanel.tsx src/components/ tests/src/components/
git commit -m "feat: implement AI panel with multi-provider streaming, prompt input, and diff view"
```

---

## Task 12: Settings Panel (Renderer)

**Files:**
- Create: `src/components/SettingsPanel.tsx`
- Modify: `src/App.tsx` — add settings panel to dockview

- [ ] **Step 1: Implement SettingsPanel**

`src/components/SettingsPanel.tsx`:
```tsx
import React, { useState, useEffect, useCallback } from 'react'
import { IDockviewPanelProps } from 'dockview-react'
import { useSettingsStore } from '../stores/settings-store'

const PROVIDERS = [
  { id: 'claude', label: 'Claude (Anthropic)', envVar: 'ANTHROPIC_API_KEY' },
  { id: 'openai', label: 'OpenAI', envVar: 'OPENAI_API_KEY' },
  { id: 'gemini', label: 'Gemini (Google)', envVar: 'GOOGLE_API_KEY' },
]

export const SettingsPanel: React.FC<IDockviewPanelProps> = () => {
  const settings = useSettingsStore()
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [newPrompt, setNewPrompt] = useState('')

  useEffect(() => {
    window.electronAPI.getApiKeys().then((keys: Record<string, string>) => setApiKeys(keys || {}))
  }, [])

  const saveApiKey = useCallback(async (provider: string, key: string) => {
    await window.electronAPI.setApiKey(provider, key)
    setApiKeys((prev) => ({ ...prev, [provider]: key }))
  }, [])

  const saveSettings = useCallback(async (partial: Record<string, unknown>) => {
    settings.setSettings(partial)
    await window.electronAPI.setSettings(partial)
  }, [settings])

  const addSavedPrompt = useCallback(() => {
    if (newPrompt.trim()) {
      const updated = [...settings.savedPrompts, newPrompt.trim()]
      saveSettings({ savedPrompts: updated })
      setNewPrompt('')
    }
  }, [newPrompt, settings.savedPrompts, saveSettings])

  const removeSavedPrompt = useCallback((index: number) => {
    const updated = settings.savedPrompts.filter((_, i) => i !== index)
    saveSettings({ savedPrompts: updated })
  }, [settings.savedPrompts, saveSettings])

  const inputStyle = {
    background: '#1e1e2e', color: '#ccc', border: '1px solid #444',
    borderRadius: 4, padding: '6px 8px', fontSize: 12, width: '100%',
  }

  const labelStyle = { color: '#888', fontSize: 11, marginBottom: 4, display: 'block' as const }

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%' }}>
      <h3 style={{ color: '#ccc', marginBottom: 16 }}>Settings</h3>

      {/* API Keys */}
      <div style={{ marginBottom: 20 }}>
        <h4 style={{ color: '#6c9', fontSize: 13, marginBottom: 8 }}>API Keys</h4>
        {PROVIDERS.map((p) => (
          <div key={p.id} style={{ marginBottom: 10 }}>
            <label style={labelStyle}>{p.label} <span style={{ color: '#555' }}>({p.envVar})</span></label>
            <input
              type="password"
              value={apiKeys[p.id] || ''}
              onChange={(e) => saveApiKey(p.id, e.target.value)}
              placeholder={`Enter ${p.label} API key or set ${p.envVar}`}
              style={inputStyle}
            />
          </div>
        ))}
      </div>

      {/* Model Selection */}
      <div style={{ marginBottom: 20 }}>
        <h4 style={{ color: '#6c9', fontSize: 13, marginBottom: 8 }}>Models</h4>
        {PROVIDERS.map((p) => (
          <div key={p.id} style={{ marginBottom: 10 }}>
            <label style={labelStyle}>{p.label}</label>
            <input
              value={settings.models[p.id] || ''}
              onChange={(e) => saveSettings({ models: { ...settings.models, [p.id]: e.target.value } })}
              placeholder="Model ID"
              style={inputStyle}
            />
          </div>
        ))}
      </div>

      {/* System Prompt */}
      <div style={{ marginBottom: 20 }}>
        <h4 style={{ color: '#6c9', fontSize: 13, marginBottom: 8 }}>System Prompt</h4>
        <textarea
          value={settings.systemPrompt}
          onChange={(e) => saveSettings({ systemPrompt: e.target.value })}
          style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
        />
      </div>

      {/* Context Template */}
      <div style={{ marginBottom: 20 }}>
        <h4 style={{ color: '#6c9', fontSize: 13, marginBottom: 8 }}>Context Template</h4>
        <p style={{ color: '#666', fontSize: 10, marginBottom: 4 }}>Placeholders: {'{{title}}, {{authors}}, {{section}}'}</p>
        <textarea
          value={settings.contextTemplate}
          onChange={(e) => saveSettings({ contextTemplate: e.target.value })}
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
        />
      </div>

      {/* Saved Prompts */}
      <div style={{ marginBottom: 20 }}>
        <h4 style={{ color: '#6c9', fontSize: 13, marginBottom: 8 }}>Saved Prompts</h4>
        {settings.savedPrompts.map((prompt, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ color: '#aaa', fontSize: 12, flex: 1 }}>{prompt}</span>
            <span onClick={() => removeSavedPrompt(i)}
              style={{ color: '#666', cursor: 'pointer', fontSize: 14 }}>×</span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          <input value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)}
            placeholder="New saved prompt..." style={{ ...inputStyle, flex: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && addSavedPrompt()}
          />
          <button onClick={addSavedPrompt}
            style={{ background: '#3a3a5e', color: '#ccc', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
            Add
          </button>
        </div>
      </div>

      {/* Timeout */}
      <div>
        <h4 style={{ color: '#6c9', fontSize: 13, marginBottom: 8 }}>Timeout (seconds)</h4>
        <input
          type="number"
          value={settings.timeout / 1000}
          onChange={(e) => saveSettings({ timeout: Number(e.target.value) * 1000 })}
          style={{ ...inputStyle, width: 100 }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add settings panel to dockview in App.tsx**

Add to `components` map in `src/App.tsx`:
```typescript
import { SettingsPanel } from './components/SettingsPanel'

// Add to components:
settingsPanel: SettingsPanel,
```

Add a menu bar or keyboard shortcut to open settings as a panel. Add to `onReady`:
```typescript
// Settings panel (hidden by default, opened via menu)
// We'll add a button to open it
```

Add a simple top bar with settings button before the dockview:
```tsx
<div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
  <div style={{ height: 32, background: '#16162a', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 12px', borderBottom: '1px solid #333' }}>
    <button
      onClick={() => {
        // Add settings panel if not already open
        dockviewApiRef.current?.addPanel({
          id: 'settings',
          component: 'settingsPanel',
          title: 'Settings',
          position: { direction: 'right' },
        })
      }}
      style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}
    >
      ⚙
    </button>
  </div>
  <div style={{ flex: 1 }}>
    <DockviewReact ... />
  </div>
</div>
```

Store the dockview API ref:
```typescript
const dockviewApiRef = useRef<any>(null)

const onReady = useCallback((event: DockviewReadyEvent) => {
  dockviewApiRef.current = event.api
  // ... rest of panel setup
}, [])
```

- [ ] **Step 3: Verify settings panel**

```bash
npm run build && npm run dev:electron
```

Expected: Click gear icon → Settings panel opens as a dockable panel. API keys, model selection, system prompt, saved prompts, and timeout all work.

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsPanel.tsx src/App.tsx
git commit -m "feat: add settings panel with API keys, models, prompts, and preferences"
```

---

## Task 13: Apply AI Result to Editor

**Files:**
- Modify: `src/panels/AiPanel.tsx` — wire up Apply button to replace editor selection
- Modify: `src/stores/editor-store.ts` — add replaceSelection action
- Modify: `src/panels/Editor.tsx` — listen for replaceSelection and apply to CodeMirror

- [ ] **Step 1: Rewrite editor-store.ts with replaceSelection**

Replace `src/stores/editor-store.ts` entirely:
```typescript
import { create } from 'zustand'

interface Selection {
  text: string
  from: number
  to: number
}

interface EditorState {
  activeFile: string | null
  openFiles: string[]
  selection: Selection | null
  pendingReplacement: string | null
  setActiveFile: (file: string) => void
  setSelection: (selection: Selection | null) => void
  openFile: (file: string) => void
  closeFile: (file: string) => void
  replaceSelection: (text: string) => void
  clearReplacement: () => void
}

export const useEditorStore = create<EditorState>()((set) => ({
  activeFile: null,
  openFiles: [],
  selection: null,
  pendingReplacement: null,
  setActiveFile: (file) => set({ activeFile: file }),
  setSelection: (selection) => set({ selection }),
  openFile: (file) =>
    set((state) => ({
      openFiles: state.openFiles.includes(file) ? state.openFiles : [...state.openFiles, file],
      activeFile: file,
    })),
  closeFile: (file) =>
    set((state) => ({
      openFiles: state.openFiles.filter((f) => f !== file),
      activeFile: state.activeFile === file ? state.openFiles.find((f) => f !== file) || null : state.activeFile,
    })),
  replaceSelection: (text) => set({ pendingReplacement: text }),
  clearReplacement: () => set({ pendingReplacement: null }),
}))
```

- [ ] **Step 2: Add pendingReplacement effect to Editor.tsx**

Add the following `useEffect` inside the `Editor` component in `src/panels/Editor.tsx`, after the existing effects:
```typescript
const pendingReplacement = useEditorStore((s) => s.pendingReplacement)
const clearReplacement = useEditorStore((s) => s.clearReplacement)

useEffect(() => {
  if (pendingReplacement !== null && editorViewRef.current) {
    const sel = useEditorStore.getState().selection
    if (sel) {
      editorViewRef.current.dispatch({
        changes: { from: sel.from, to: sel.to, insert: pendingReplacement },
      })
    }
    clearReplacement()
  }
}, [pendingReplacement, clearReplacement])
```

- [ ] **Step 3: Update AiPanel handleApply**

In `src/panels/AiPanel.tsx`, replace the `handleApply` callback:
```typescript
const replaceSelection = useEditorStore((s) => s.replaceSelection)

const handleApply = useCallback((text: string) => {
  replaceSelection(text)
}, [replaceSelection])
```

- [ ] **Step 4: Verify Apply works end-to-end**

```bash
npm run build && npm run dev:electron
```

Expected: Select text → send to AI → click "Apply" on a result → editor text is replaced with AI suggestion.

- [ ] **Step 5: Commit**

```bash
git add src/stores/editor-store.ts src/panels/Editor.tsx src/panels/AiPanel.tsx
git commit -m "feat: wire Apply button to replace editor selection with AI result"
```

---

## Task 14: Context Assembly Based on Scope

**Files:**
- Modify: `src/panels/AiPanel.tsx` — build context based on contextScope setting

- [ ] **Step 1: Replace handleSend in AiPanel.tsx**

Replace the `handleSend` callback in `src/panels/AiPanel.tsx` with the following. Also add `contextTemplate` to the destructured settings:
```typescript
const { systemPrompt, contextScope, models, contextTemplate } = useSettingsStore()

const handleSend = useCallback(async (userPrompt: string) => {
  if (!selection) return

  startRequest(selectedProviders)

  let context = ''
  const { activeFile, openFiles } = useEditorStore.getState()

  if (contextScope === 'section' && activeFile) {
    const content = await window.electronAPI.readFile(activeFile)
    context = content
  } else if (contextScope === 'full') {
    const parts: string[] = []
    for (const file of openFiles) {
      if (file.endsWith('.tex')) {
        const content = await window.electronAPI.readFile(file)
        parts.push(`--- ${file.split('/').pop()} ---\n${content}`)
      }
    }
    context = parts.join('\n\n')
  }
  // contextScope === 'selection' → context stays empty

  // Apply context template with paper metadata placeholders
  // Extract basic metadata from the first .tex file if available
  let formattedContext = contextTemplate
    .replace('{{title}}', extractMetadata(context, 'title'))
    .replace('{{authors}}', extractMetadata(context, 'author'))
    .replace('{{section}}', activeFile?.split('/').pop() || '')

  if (context) {
    formattedContext += '\n\n' + context
  }

  await window.electronAPI.aiRequest({
    providers: selectedProviders,
    systemPrompt,
    context: formattedContext,
    selectedText: selection.text,
    userPrompt,
    models,
  })
}, [selection, selectedProviders, systemPrompt, contextScope, contextTemplate, models, startRequest])

// Helper to extract LaTeX metadata
function extractMetadata(texContent: string, command: string): string {
  const match = texContent.match(new RegExp(`\\\\${command}\\{([^}]*)\\}`))
  return match?.[1] || ''
}
```

- [ ] **Step 2: Verify context scope works**

```bash
npm run build && npm run dev:electron
```

Expected: Switching context scope in AI panel changes how much context is sent with requests. "selection" sends only selected text, "section" sends current file, "full" sends all open files.

- [ ] **Step 3: Commit**

```bash
git add src/panels/AiPanel.tsx
git commit -m "feat: implement context scope control (selection/section/full) for AI requests"
```

---

## Task 15: Load Settings from Main Process on Startup

**Files:**
- Modify: `src/App.tsx` — load settings on mount
- Modify: `src/stores/settings-store.ts` — add loadFromMain action

- [ ] **Step 1: Rewrite settings-store.ts with loadFromMain**

Replace `src/stores/settings-store.ts` entirely:
```typescript
import { create } from 'zustand'

interface SettingsState {
  systemPrompt: string
  contextTemplate: string
  contextScope: 'selection' | 'section' | 'full'
  savedPrompts: string[]
  models: Record<string, string>
  timeout: number
  setSettings: (settings: Partial<SettingsState>) => void
  loadFromMain: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  systemPrompt: 'You are an academic writing assistant.',
  contextTemplate: 'Paper title: {{title}}\nAuthors: {{authors}}\nSection: {{section}}',
  contextScope: 'section',
  savedPrompts: [],
  models: { claude: 'claude-sonnet-4-20250514', openai: 'gpt-4o', gemini: 'gemini-2.0-flash' },
  timeout: 60000,
  setSettings: (settings) => set(settings),
  loadFromMain: async () => {
    const settings = await window.electronAPI.getSettings()
    set(settings)
  },
}))
```

- [ ] **Step 2: Call loadFromMain in App.tsx on mount**

Add to `src/App.tsx`:
```typescript
import { useSettingsStore } from './stores/settings-store'

// Inside App component:
useEffect(() => {
  useSettingsStore.getState().loadFromMain()
}, [])
```

- [ ] **Step 3: Verify settings persist across restarts**

```bash
npm run build && npm run dev:electron
```

Expected: Change settings → close app → reopen → settings are preserved.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/stores/settings-store.ts
git commit -m "feat: load persisted settings from main process on startup"
```

---

## Task 16: Final Integration and Polish

**Files:**
- Modify: `src/styles/global.css` — polish dark theme
- Create: `.gitignore`
- Modify: `package.json` — add build/package scripts

- [ ] **Step 1: Create .gitignore**

`.gitignore`:
```
node_modules/
dist/
dist-electron/
release/
.superpowers/
*.log
```

- [ ] **Step 2: Add dockview dark theme overrides to global.css**

Append to `src/styles/global.css`:
```css
/* dockview dark theme overrides */
.dockview-theme-dark {
  --dv-activegroup-hightlight-color: #6c9;
  --dv-group-view-background-color: #1e1e2e;
  --dv-tabs-and-actions-container-background-color: #16162a;
  --dv-activegroup-visiblepanel-tab-background-color: #2a2a3e;
  --dv-activegroup-visiblepanel-tab-color: #6c9;
  --dv-inactivegroup-visiblepanel-tab-background-color: #252540;
  --dv-inactivegroup-visiblepanel-tab-color: #888;
  --dv-tab-divider-color: #333;
  --dv-separator-border: #333;
}

/* CodeMirror overrides */
.cm-editor {
  height: 100%;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #1a1a2e;
}

::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #444;
}
```

- [ ] **Step 3: Verify full app styling**

```bash
npm run build && npm run dev:electron
```

Expected: Consistent dark theme across all panels, proper scrollbars, dockview tabs match theme.

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add .gitignore src/styles/global.css package.json
git commit -m "feat: add dark theme polish, gitignore, and finalize project config"
```
