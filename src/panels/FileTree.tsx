import React from 'react'
import { IDockviewPanelProps } from 'dockview-react'

export const FileTree: React.FC<IDockviewPanelProps> = () => {
  return (
    <div style={{ padding: 12, height: '100%', overflow: 'auto' }}>
      <div style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Explorer</div>
      <div style={{ color: '#aaa' }}>Open a project to browse files</div>
    </div>
  )
}
