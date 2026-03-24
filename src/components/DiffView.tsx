import React from 'react'
import { diffWords } from 'diff'

interface Props {
  original: string
  suggested: string
}

export const DiffView: React.FC<Props> = ({ original, suggested }) => {
  const changes = diffWords(original, suggested)

  return (
    <div style={{ fontSize: 12, lineHeight: 1.6, padding: 8, background: '#1a1a2e', borderRadius: 4 }}>
      {changes.map((change, i) => (
        <span
          key={i}
          style={{
            background: change.added ? 'rgba(80,200,120,0.2)' : change.removed ? 'rgba(200,80,80,0.2)' : 'transparent',
            textDecoration: change.removed ? 'line-through' : 'none',
            color: change.added ? '#6c9' : change.removed ? '#c66' : '#ccc',
          }}
        >
          {change.value}
        </span>
      ))}
    </div>
  )
}
