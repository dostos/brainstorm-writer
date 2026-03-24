import React from 'react'
import { diffWords } from 'diff'

interface InlineDiffProps {
  original: string
  suggested: string
  comments: string    // AI's explanation of changes
  provider: string
  onAccept: () => void
  onReject: () => void
}

export function InlineDiff({ original, suggested, comments, provider, onAccept, onReject }: InlineDiffProps) {
  const changes = diffWords(original, suggested)

  return (
    <div style={{
      background: '#1a2a1a',
      border: '1px solid #2a4a2a',
      borderRadius: 4,
      margin: '4px 0',
      fontSize: 13,
      lineHeight: 1.6,
      fontFamily: 'inherit',
      display: 'flex',
    }}>
      {/* Left: Diff content */}
      <div style={{ flex: 1, padding: '8px 12px', borderRight: comments ? '1px solid #2a4a2a' : 'none' }}>
        {/* Header with buttons */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 6, fontSize: 11, color: '#888',
        }}>
          <span>Suggested by <strong style={{ color: '#6c9' }}>{provider}</strong></span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={onAccept} style={{
              background: '#4a4', color: '#fff', border: 'none',
              padding: '2px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
            }}>Accept (Tab)</button>
            <button onClick={onReject} style={{
              background: '#444', color: '#ccc', border: 'none',
              padding: '2px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
            }}>Reject (Esc)</button>
          </div>
        </div>

        {/* Diff */}
        <div style={{ whiteSpace: 'pre-wrap' }}>
          {changes.map((change, i) => (
            <span key={i} style={{
              background: change.added ? 'rgba(80,200,120,0.2)' : change.removed ? 'rgba(200,80,80,0.15)' : 'transparent',
              textDecoration: change.removed ? 'line-through' : 'none',
              color: change.added ? '#6c9' : change.removed ? '#c66' : '#ccc',
            }}>{change.value}</span>
          ))}
        </div>
      </div>

      {/* Right: AI comments — why it made these changes */}
      {comments && (
        <div style={{
          width: 220, padding: '8px 10px', fontSize: 11, color: '#aaa',
          lineHeight: 1.5, overflow: 'auto', background: '#1a1a2a',
          borderRadius: '0 4px 4px 0',
        }}>
          <div style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 }}>
            Comments
          </div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{comments}</div>
        </div>
      )}
    </div>
  )
}
