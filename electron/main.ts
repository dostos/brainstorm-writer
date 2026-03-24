import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { SettingsManager } from './settings-manager'

const settingsManager = new SettingsManager()

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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
