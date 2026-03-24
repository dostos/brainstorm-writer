import React, { useEffect, useRef } from 'react'
import { IDockviewPanelProps } from 'dockview-react'
import { useBuildStore } from '../stores/build-store'

export const BuildLog: React.FC<IDockviewPanelProps> = () => {
  const { logs } = useBuildStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#0d0d1a',
        color: '#ccc',
        fontFamily: 'monospace',
        fontSize: 12,
        overflowY: 'auto',
        padding: '8px',
        boxSizing: 'border-box',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
    >
      {logs || <span style={{ color: '#555' }}>Build output will appear here...</span>}
      <div ref={bottomRef} />
    </div>
  )
}
