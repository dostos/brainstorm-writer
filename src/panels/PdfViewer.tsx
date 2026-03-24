import React from 'react'
import { IDockviewPanelProps } from 'dockview-react'

export const PdfViewer: React.FC<IDockviewPanelProps> = () => {
  return (
    <div style={{ padding: 12, height: '100%' }}>
      <div style={{ color: '#aaa' }}>No PDF loaded</div>
    </div>
  )
}
