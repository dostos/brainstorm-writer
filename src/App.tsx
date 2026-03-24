import React, { useCallback, useEffect, useRef } from 'react'
import { DockviewReact, DockviewReadyEvent, IDockviewPanelProps } from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import { FileTree } from './panels/FileTree'
import { Editor } from './panels/Editor'
import { PdfViewer } from './panels/PdfViewer'
import { AiPanel } from './panels/AiPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { useSettingsStore } from './stores/settings-store'
import { useProjectStore } from './stores/project-store'

const components: Record<string, React.FC<IDockviewPanelProps>> = {
  fileTree: FileTree,
  editor: Editor,
  pdfViewer: PdfViewer,
  aiPanel: AiPanel,
  settingsPanel: SettingsPanel,
}

export default function App() {
  const dockviewApiRef = useRef<any>(null)

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

  const onReady = useCallback((event: DockviewReadyEvent) => {
    dockviewApiRef.current = event.api

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

    // Set initial sizes
    event.api.getGroup(fileTreePanel)?.api.setSize({ width: 200 })
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 32, background: '#16162a', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 12px', borderBottom: '1px solid #333' }}>
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
          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}
        >
          ⚙
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
