import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, ChildProcess } from 'child_process'
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
let currentProjectPath: string | null = null
let buildProcess: ChildProcess | null = null

function isPathInsideProject(filePath: string): boolean {
  if (!currentProjectPath) return false
  const resolved = path.resolve(filePath)
  const projectResolved = path.resolve(currentProjectPath)
  return resolved.startsWith(projectResolved + path.sep) || resolved === projectResolved
}

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

  // v1.0 #2: Confirm close so users don't lose unsaved work
  mainWindow.on('close', (e) => {
    const choice = dialog.showMessageBoxSync(mainWindow!, {
      type: 'question',
      buttons: ['Close', 'Cancel'],
      defaultId: 1,
      message: 'Are you sure you want to close? Unsaved changes will be auto-saved.',
    })
    if (choice === 1) e.preventDefault()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  const { session } = require('electron')
  session.defaultSession.webRequest.onHeadersReceived((details: { responseHeaders?: Record<string, string[]> }, callback: (response: { responseHeaders: Record<string, string[]> }) => void) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws://localhost:*"],
      },
    })
  })

  createWindow()

  ipcMain.handle('settings:get', () => settingsManager.getAll())
  ipcMain.handle('settings:set', (_e, settings) => {
    const allowedKeys = ['systemPrompt', 'contextTemplate', 'contextScope', 'savedPrompts', 'models', 'providerModes', 'timeout']
    const filtered: Record<string, unknown> = {}
    for (const key of allowedKeys) {
      if (key in settings) filtered[key] = settings[key]
    }
    settingsManager.set(filtered as any)
  })
  ipcMain.handle('settings:get-keys', () => {
    const keys = settingsManager.getApiKeys()
    return {
      claude: Boolean(keys.claude),
      openai: Boolean(keys.openai),
      gemini: Boolean(keys.gemini),
    }
  })
  ipcMain.handle('settings:set-key', (_e, provider, key) => settingsManager.setApiKey(provider, key))

  ipcMain.handle('file:open-project', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    const projectPath = result.filePaths[0]
    currentProjectPath = projectPath
    const tree = await fileManager.scanProject(projectPath)
    settingsManager.setLastProject(projectPath)
    return { projectPath, tree }
  })

  ipcMain.handle('file:get-last-project', async () => {
    const lastPath = settingsManager.getLastProject()
    if (!lastPath) return null
    try {
      const tree = await fileManager.scanProject(lastPath)
      currentProjectPath = lastPath
      return { projectPath: lastPath, tree }
    } catch {
      return null
    }
  })

  ipcMain.handle('file:find-pdfs', async (_e, dirPath: string) => fileManager.findPdfs(dirPath))
  ipcMain.handle('file:find-project-pdf', async (_e, projectPath: string) => fileManager.findProjectPdf(projectPath))
  ipcMain.handle('file:search-tex', async (_e, dirPath: string, searchText: string) => fileManager.searchInTexFiles(dirPath, searchText))
  ipcMain.handle('file:read', async (_e, filePath: string) => {
    if (!isPathInsideProject(filePath)) throw new Error('Access denied: path is outside project directory')
    return fileManager.readFile(filePath)
  })
  ipcMain.handle('file:read-buffer', async (_e, filePath: string) => {
    if (!isPathInsideProject(filePath)) throw new Error('Access denied: path is outside project directory')
    return fileManager.readFileBuffer(filePath)
  })
  ipcMain.handle('file:write', async (_e, filePath: string, content: string) => {
    if (!isPathInsideProject(filePath)) throw new Error('Access denied: path is outside project directory')
    return fileManager.writeFile(filePath, content)
  })

  ipcMain.handle('file:create', async (_e, filePath: string, content: string) => {
    if (!isPathInsideProject(filePath)) throw new Error('Access denied: path is outside project directory')
    fs.writeFileSync(filePath, content ?? '', 'utf8')
    return currentProjectPath ? await fileManager.scanProject(currentProjectPath) : []
  })

  ipcMain.handle('file:rename', async (_e, oldPath: string, newPath: string) => {
    if (!isPathInsideProject(oldPath)) throw new Error('Access denied: path is outside project directory')
    if (!isPathInsideProject(newPath)) throw new Error('Access denied: path is outside project directory')
    fs.renameSync(oldPath, newPath)
    return currentProjectPath ? await fileManager.scanProject(currentProjectPath) : []
  })

  ipcMain.handle('file:delete', async (_e, filePath: string) => {
    if (!isPathInsideProject(filePath)) throw new Error('Access denied: path is outside project directory')
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true })
    } else {
      fs.unlinkSync(filePath)
    }
    return currentProjectPath ? await fileManager.scanProject(currentProjectPath) : []
  })

  ipcMain.handle('file:scan', async () => {
    if (!currentProjectPath) return []
    return fileManager.scanProject(currentProjectPath)
  })

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

  ipcMain.handle('latex:build', async (_e, projectPath: string) => {
    // Find main .tex file
    let mainTexFile: string | null = null
    try {
      const files = fs.readdirSync(projectPath)
      // First look for main.tex
      if (files.includes('main.tex')) {
        mainTexFile = 'main.tex'
      } else {
        // Look for first .tex file containing \documentclass
        for (const file of files) {
          if (file.endsWith('.tex')) {
            const content = fs.readFileSync(path.join(projectPath, file), 'utf8')
            if (content.includes('\\documentclass')) {
              mainTexFile = file
              break
            }
          }
        }
      }
    } catch (err) {
      mainWindow?.webContents.send('latex:log', `Error finding .tex file: ${err}\n`)
      mainWindow?.webContents.send('latex:done', { code: 1 })
      return
    }

    if (!mainTexFile) {
      mainWindow?.webContents.send('latex:log', 'No main .tex file found in project directory.\n')
      mainWindow?.webContents.send('latex:done', { code: 1 })
      return
    }

    // Kill any existing build
    if (buildProcess) {
      buildProcess.kill()
      buildProcess = null
    }

    const proc = spawn(
      'latexmk',
      ['-pdf', '-synctex=1', '-interaction=nonstopmode', mainTexFile],
      { cwd: projectPath }
    )
    buildProcess = proc

    proc.stdout.on('data', (data: Buffer) => {
      mainWindow?.webContents.send('latex:log', data.toString())
    })
    proc.stderr.on('data', (data: Buffer) => {
      mainWindow?.webContents.send('latex:log', data.toString())
    })
    proc.on('close', (code: number | null) => {
      // B7: guard against a newer build having replaced this process
      if (buildProcess !== proc) return
      buildProcess = null
      mainWindow?.webContents.send('latex:done', { code: code ?? 1 })
    })
    proc.on('error', (err: Error) => {
      // B7: guard against a newer build having replaced this process
      if (buildProcess !== proc) return
      buildProcess = null
      mainWindow?.webContents.send('latex:log', `Failed to start latexmk: ${err.message}\n`)
      mainWindow?.webContents.send('latex:done', { code: 1 })
    })
  })

  ipcMain.handle('latex:cancel', () => {
    if (buildProcess) {
      buildProcess.kill()
      buildProcess = null
    }
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
