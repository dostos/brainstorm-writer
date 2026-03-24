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
