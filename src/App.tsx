import React, { useCallback, useEffect, useRef, useState } from 'react'
import { DockviewReact, DockviewReadyEvent, IDockviewPanelProps } from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import { FileTree } from './panels/FileTree'
import { Editor } from './panels/Editor'
import { PdfViewer } from './panels/PdfViewer'
import { AiPanel } from './panels/AiPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { BuildLog } from './components/BuildLog'
import { useSettingsStore } from './stores/settings-store'
import { useProjectStore } from './stores/project-store'
import { useBuildStore } from './stores/build-store'
import { useAiStore } from './stores/ai-store'

const components: Record<string, React.FC<IDockviewPanelProps>> = {
  fileTree: FileTree,
  editor: Editor,
  pdfViewer: PdfViewer,
  aiPanel: AiPanel,
  settingsPanel: SettingsPanel,
  buildLog: BuildLog,
}

export default function App() {
  const dockviewApiRef = useRef<any>(null)
  const { status: buildStatus, appendLog, clearLogs, setStatus } = useBuildStore()
  const [flashGreen, setFlashGreen] = useState(false)

  useEffect(() => {
    // Small delay to ensure IPC handlers are registered in main process
    const timer = setTimeout(async () => {
      try {
        await useSettingsStore.getState().loadFromMain()
      } catch { /* settings not ready yet */ }
      try {
        const result = await window.electronAPI.getLastProject()
        if (result) {
          useProjectStore.getState().setProject(result.projectPath, result.tree)
          window.electronAPI.watchProject(result.projectPath)
        }
      } catch { /* no last project or handler not ready */ }
    }, 200)
    return () => clearTimeout(timer)
  }, [])

  // Global AI stream listener — must be in App (always mounted), not AiPanel (may be inactive tab)
  const firstDoneRef = useRef<string | null>(null)
  useEffect(() => {
    const cleanup = window.electronAPI.onAiStream((data) => {
      if (data.type === 'done') {
        const store = useAiStore.getState()
        if (firstDoneRef.current === null) {
          firstDoneRef.current = data.provider
          const providerResult = store.results[data.provider]
          if (providerResult) {
            store.addToHistory('assistant', providerResult.text)
          }
        }
        store.finishProvider(data.provider)
      } else if (data.type === 'error') {
        useAiStore.getState().finishProvider(data.provider, data.error)
      } else if (data.type === 'delta') {
        useAiStore.getState().appendChunk(data.provider, data.text ?? '')
      }
    })
    return cleanup
  }, [])

  // Reset firstDoneRef when a new request starts
  useEffect(() => {
    const unsub = useAiStore.subscribe((state, prev) => {
      if (state.isLoading && !prev.isLoading) {
        firstDoneRef.current = null
      }
    })
    return unsub
  }, [])

  // Set up build log IPC listeners
  useEffect(() => {
    const cleanupLog = window.electronAPI.onBuildLog((data) => {
      appendLog(data)
    })
    const cleanupDone = window.electronAPI.onBuildDone(async ({ code }) => {
      if (code === 0) {
        // v1.0 #4: Re-parse SyncTeX after a successful build
        const projectPath = useProjectStore.getState().projectPath
        if (projectPath) {
          const candidates = ['main.synctex.gz', 'output/main.synctex.gz']
          for (const name of candidates) {
            try {
              await window.electronAPI.parseSynctex(`${projectPath}/${name}`)
              break
            } catch { /* try next candidate */ }
          }
        }
        setStatus('success')
        setFlashGreen(true)
        setTimeout(() => {
          setFlashGreen(false)
          setStatus('idle')
        }, 2000)
      } else {
        setStatus('error')
      }
    })
    return () => {
      cleanupLog()
      cleanupDone()
    }
  }, [appendLog, setStatus])

  const openBuildLog = useCallback(() => {
    if (!dockviewApiRef.current) return
    const existing = dockviewApiRef.current.getPanel('buildLog')
    if (existing) {
      existing.focus()
    } else {
      try {
        dockviewApiRef.current.addPanel({
          id: 'buildLog',
          component: 'buildLog',
          title: 'Build Log',
          position: { direction: 'below' },
        })
      } catch {
        // panel already exists
      }
    }
  }, [])

  const handleBuild = useCallback(async () => {
    const projectPath = useProjectStore.getState().projectPath
    if (!projectPath) return
    clearLogs()
    setStatus('building')
    openBuildLog()
    await window.electronAPI.buildLatex(projectPath)
  }, [clearLogs, setStatus, openBuildLog])

  const handleCancelBuild = useCallback(async () => {
    await window.electronAPI.cancelBuild()
    setStatus('idle')
  }, [setStatus])

  const onReady = useCallback((event: DockviewReadyEvent) => {
    dockviewApiRef.current = event.api

    // Overleaf-style layout: [Explorer+AI | Editor | PDF]
    const fileTreePanel = event.api.addPanel({
      id: 'fileTree',
      component: 'fileTree',
      title: 'Explorer',
    })

    // AI panel as a tab alongside Explorer (same group, left column)
    event.api.addPanel({
      id: 'aiPanel',
      component: 'aiPanel',
      title: 'AI Assistant',
      position: { referencePanel: fileTreePanel, direction: 'within' },
    })

    // Editor in the center
    const editorPanel = event.api.addPanel({
      id: 'editor',
      component: 'editor',
      title: 'Editor',
      position: { referencePanel: fileTreePanel, direction: 'right' },
    })

    // PDF on the right
    event.api.addPanel({
      id: 'pdfViewer',
      component: 'pdfViewer',
      title: 'PDF Preview',
      position: { referencePanel: editorPanel, direction: 'right' },
    })

    // Set initial sizes — left panel narrower, editor and PDF split the rest
    event.api.getGroup(fileTreePanel)?.api.setSize({ width: 300 })
  }, [])

  const buildButtonColor = flashGreen ? '#4caf50' : buildStatus === 'error' ? '#f44336' : '#888'

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 32, background: '#16162a', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 12px', borderBottom: '1px solid #333', gap: 8 }}>
        {buildStatus === 'building' ? (
          <>
            <span style={{ color: '#aaa', fontSize: 12 }}>Building...</span>
            <button
              onClick={handleCancelBuild}
              title="Stop build"
              style={{ background: 'none', border: 'none', color: '#f44336', cursor: 'pointer', fontSize: 14 }}
            >
              ■
            </button>
          </>
        ) : (
          <button
            onClick={handleBuild}
            title="Build LaTeX project"
            style={{ background: 'none', border: 'none', color: buildButtonColor, cursor: 'pointer', fontSize: 16, transition: 'color 0.3s' }}
          >
            ▶
          </button>
        )}
        <button
          onClick={() => {
            // Add settings panel if not already open
            try {
              dockviewApiRef.current?.addPanel({
                id: 'settings',
                component: 'settingsPanel',
                title: 'Settings',
                position: { direction: 'right' },
              })
            } catch {
              // Panel may already be open; focus it instead
              dockviewApiRef.current?.getPanel('settings')?.focus()
            }
          }}
          title="Settings"
          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          ⚙<span style={{ fontSize: 11 }}>Settings</span>
        </button>
      </div>
      <div style={{ flex: 1 }}>
        <DockviewReact
          className="dockview-theme-dark"
          onReady={onReady}
          components={components}
        />
      </div>
    </div>
  )
}
