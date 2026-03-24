import React, { useEffect, useRef } from 'react'
import { IDockviewPanelProps } from 'dockview-react'
import { useBuildStore } from '../stores/build-store'
import { useEditorStore } from '../stores/editor-store'
import { useAiStore } from '../stores/ai-store'
import { useProjectStore } from '../stores/project-store'

// Parsed line types
interface NormalLine {
  type: 'normal'
  text: string
}

interface ErrorLine {
  type: 'error'
  text: string
  filename?: string
  lineNumber?: number
}

type ParsedLine = NormalLine | ErrorLine

// Extract filename from a log line, relative to the project root
function resolveFilename(raw: string, projectPath: string | null): string | undefined {
  if (!raw) return undefined
  // Already absolute
  if (raw.startsWith('/')) return raw
  if (!projectPath) return undefined
  return `${projectPath}/${raw.replace(/^\.\//, '')}`
}

export function parseBuildLog(log: string, projectPath: string | null): ParsedLine[] {
  const lines = log.split('\n')
  const result: ParsedLine[] = []

  // Track most recently seen file context from (./file.tex patterns
  let currentFile: string | undefined

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Update current file from paren-based file context: (./something.tex
    const fileCtxMatch = line.match(/\((\.[/\\][^\s()]+\.tex)/)
    if (fileCtxMatch) {
      currentFile = resolveFilename(fileCtxMatch[1], projectPath)
    }

    // Pattern 1: `! LaTeX Error: ...` or `! <anything>`
    if (/^!\s/.test(line)) {
      // Look ahead for an `l.<number>` line
      let lineNumber: number | undefined
      let filename: string | undefined = currentFile
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const lMatch = lines[j].match(/^l\.(\d+)/)
        if (lMatch) {
          lineNumber = parseInt(lMatch[1], 10)
          break
        }
      }
      result.push({ type: 'error', text: line, filename, lineNumber })
      continue
    }

    // Pattern 2: `./filename.tex:42:` or `/abs/path.tex:42:`
    const fileLineMatch = line.match(/^(\.\/[^\s:]+\.tex|\/[^\s:]+\.tex):(\d+):/)
    if (fileLineMatch) {
      const filename = resolveFilename(fileLineMatch[1], projectPath)
      const lineNumber = parseInt(fileLineMatch[2], 10)
      result.push({ type: 'error', text: line, filename, lineNumber })
      continue
    }

    result.push({ type: 'normal', text: line })
  }

  return result
}

async function fixWithAi(
  filename: string | undefined,
  lineNumber: number | undefined,
  errorText: string,
  projectPath: string | null,
) {
  const { openFile, jumpToLine, setSelection } = useEditorStore.getState()
  const { setPendingPrompt } = useAiStore.getState()

  if (filename) {
    openFile(filename)
    if (lineNumber !== undefined) {
      jumpToLine(lineNumber)
    }
  }

  // Read context lines around the error if possible
  let contextText = ''
  if (filename && lineNumber !== undefined) {
    try {
      const content = await window.electronAPI.readFile(filename)
      const fileLines = content.split('\n')
      const from = Math.max(0, lineNumber - 6)
      const to = Math.min(fileLines.length, lineNumber + 5)
      const contextLines = fileLines.slice(from, to)
      contextText = contextLines.join('\n')
      // Calculate character offsets for the selection
      const charFrom = fileLines.slice(0, from).reduce((acc, l) => acc + l.length + 1, 0)
      const charTo = charFrom + contextText.length
      setSelection({ text: contextText, from: charFrom, to: charTo })
    } catch {
      // If we can't read the file, proceed without selection
    }
  }

  const prompt = `Fix this LaTeX compilation error: ${errorText.trim()}${contextText ? `\n\nContext:\n\`\`\`latex\n${contextText}\n\`\`\`` : ''}`
  setPendingPrompt(prompt)
}

export const BuildLog: React.FC<IDockviewPanelProps> = () => {
  const { logs } = useBuildStore()
  const projectPath = useProjectStore((s) => s.projectPath)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  if (!logs) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0d0d1a',
          color: '#555',
          fontFamily: 'monospace',
          fontSize: 12,
          overflowY: 'auto',
          padding: '8px',
          boxSizing: 'border-box',
        }}
      >
        Build output will appear here...
      </div>
    )
  }

  const parsed = parseBuildLog(logs, projectPath)

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
      }}
    >
      {parsed.map((line, idx) => {
        if (line.type === 'normal') {
          return (
            <div key={idx} style={{ color: '#888', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {line.text}
            </div>
          )
        }

        // Error line
        const { text, filename, lineNumber } = line
        return (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              marginTop: 2,
              marginBottom: 2,
            }}
          >
            <span style={{ color: '#f55', fontWeight: 'bold', flex: 1 }}>
              {filename && lineNumber !== undefined ? (
                <>
                  {/* Render the text, but make any l.<n> or file:line references clickable */}
                  {text.replace(/l\.(\d+)/, '').trimEnd()}{' '}
                  <span
                    onClick={() => {
                      const { openFile, jumpToLine } = useEditorStore.getState()
                      openFile(filename)
                      jumpToLine(lineNumber)
                    }}
                    title={`Jump to ${filename.split('/').pop()}:${lineNumber}`}
                    style={{
                      color: '#7af',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      fontWeight: 'normal',
                      fontSize: 11,
                    }}
                  >
                    line {lineNumber}
                  </span>
                </>
              ) : lineNumber !== undefined && filename ? (
                text
              ) : (
                text
              )}
            </span>
            <button
              onClick={() => fixWithAi(filename, lineNumber, text, projectPath)}
              title="Pre-fill AI panel with this error"
              style={{
                background: '#3a3a5e',
                color: '#9af',
                border: '1px solid #555',
                borderRadius: 3,
                padding: '1px 7px',
                fontSize: 10,
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              Fix with AI
            </button>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
