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

    // Set initial sizes
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
