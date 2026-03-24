import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  openProject: () => ipcRenderer.invoke('file:open-project'),
  getLastProject: () => ipcRenderer.invoke('file:get-last-project'),
  findPdfs: (dirPath: string) => ipcRenderer.invoke('file:find-pdfs', dirPath),
  searchTex: (dirPath: string, text: string) => ipcRenderer.invoke('file:search-tex', dirPath, text),
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
