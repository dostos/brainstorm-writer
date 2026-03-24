import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import { SettingsManager } from './settings-manager'
import { FileManager } from './file-manager'

const settingsManager = new SettingsManager()
const fileManager = new FileManager()

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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
