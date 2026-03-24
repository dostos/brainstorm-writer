import React from 'react'
import { IDockviewPanelProps } from 'dockview-react'

export const AiPanel: React.FC<IDockviewPanelProps> = () => {
  return (
    <div style={{ padding: 12, height: '100%' }}>
      <div style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>AI Assistant</div>
      <div style={{ color: '#aaa' }}>Select text in the editor or PDF to get started</div>
    </div>
  )
}
