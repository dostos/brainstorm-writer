import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import { SettingsManager } from './settings-manager'
import { FileManager } from './file-manager'
import { AiProviderManager } from './ai-provider'
import { SynctexParser, SynctexData } from './synctex-parser'

const settingsManager = new SettingsManager()
const fileManager = new FileManager()
const aiManager = new AiProviderManager()
const synctexParser = new SynctexParser()
let synctexData: SynctexData | null = null

let mainWindow: BrowserWindow | null = null

function createWindow() {
  // Restore last window bounds
  const bounds = settingsManager.getWindowBounds()

  mainWindow = new BrowserWindow({
    ...bounds,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Save window bounds on resize/move
  const saveBounds = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      settingsManager.setWindowBounds(mainWindow.getBounds())
    }
  }
  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  ipcMain.handle('settings:get', () => settingsManager.getAll())
  ipcMain.handle('settings:set', (_e, settings) => settingsManager.set(settings))
  ipcMain.handle('settings:get-keys', () => settingsManager.getApiKeys())
  ipcMain.handle('settings:set-key', (_e, provider, key) => settingsManager.setApiKey(provider, key))

  ipcMain.handle('file:open-project', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    const projectPath = result.filePaths[0]
    const tree = await fileManager.scanProject(projectPath)
    settingsManager.setLastProject(projectPath)
    return { projectPath, tree }
  })

  ipcMain.handle('file:get-last-project', async () => {
    const lastPath = settingsManager.getLastProject()
    if (!lastPath) return null
    try {
      const tree = await fileManager.scanProject(lastPath)
      return { projectPath: lastPath, tree }
    } catch {
      return null
    }
  })

  ipcMain.handle('file:find-pdfs', async (_e, dirPath: string) => fileManager.findPdfs(dirPath))
  ipcMain.handle('file:search-tex', async (_e, dirPath: string, searchText: string) => fileManager.searchInTexFiles(dirPath, searchText))
  ipcMain.handle('file:read', async (_e, filePath: string) => fileManager.readFile(filePath))
  ipcMain.handle('file:read-buffer', async (_e, filePath: string) => fileManager.readFileBuffer(filePath))
  ipcMain.handle('file:write', async (_e, filePath: string, content: string) => fileManager.writeFile(filePath, content))

  ipcMain.handle('file:watch', async (_e, projectPath: string) => {
    fileManager.watch(projectPath, (filePath) => {
      mainWindow?.webContents.send('file:changed', filePath)
    })
  })

  ipcMain.handle('ai:request', async (_e, params) => {
    const keys = settingsManager.getApiKeys()
    await aiManager.sendToAll(params, keys as Record<string, string | undefined>, mainWindow!)
  })

  ipcMain.handle('ai:cancel', () => {
    aiManager.cancelAll()
  })

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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
