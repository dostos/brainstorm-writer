export interface ElectronAPI {
  // File operations
  openProject: () => Promise<{ projectPath: string; tree: any[] } | null>
  getLastProject: () => Promise<{ projectPath: string; tree: any[] } | null>
  findPdfs: (dirPath: string) => Promise<string[]>
  findProjectPdf: (projectPath: string) => Promise<{ path: string; buffer: ArrayBuffer } | null>
  searchTex: (dirPath: string, text: string) => Promise<{ file: string; line: number } | null>
  readFile: (filePath: string) => Promise<string>
  readFileBuffer: (filePath: string) => Promise<ArrayBuffer>
  writeFile: (filePath: string, content: string) => Promise<void>
  createFile: (filePath: string, content: string) => Promise<any[]>
  renameFile: (oldPath: string, newPath: string) => Promise<any[]>
  deleteFile: (filePath: string) => Promise<any[]>
  scanProject: () => Promise<any[]>
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
  // LaTeX build
  buildLatex: (projectPath: string) => Promise<void>
  cancelBuild: () => Promise<void>
  onBuildLog: (callback: (data: string) => void) => () => void
  onBuildDone: (callback: (result: { code: number }) => void) => () => void
  // Settings
  getSettings: () => Promise<any>
  setSettings: (settings: any) => Promise<void>
  hasApiKeys: () => Promise<Record<string, boolean>>
  setApiKey: (provider: string, key: string) => Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
