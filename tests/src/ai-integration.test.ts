import { describe, it, expect, beforeEach } from 'vitest'
import { useAiStore } from '../../src/stores/ai-store'
import { useEditorStore } from '../../src/stores/editor-store'
import { parseAiResponse, stripCodeFences } from '../../src/panels/AiPanel'

describe('AI Integration - Inline Diff Flow', () => {
  beforeEach(() => {
    useAiStore.getState().clearResults()
    useAiStore.getState().clearHistory()
    useEditorStore.setState({
      activeFile: '/test/file.tex',
      openFiles: ['/test/file.tex'],
      selection: { text: 'original text', from: 10, to: 23 },
      pendingInlineDiff: null,
    })
  })

  it('startRequest → appendChunk → finishProvider cycle works', () => {
    useAiStore.getState().startRequest(['claude'])
    expect(useAiStore.getState().isLoading).toBe(true)
    expect(useAiStore.getState().results.claude.text).toBe('')

    useAiStore.getState().appendChunk('claude', 'hello ')
    useAiStore.getState().appendChunk('claude', 'world')
    expect(useAiStore.getState().results.claude.text).toBe('hello world')

    useAiStore.getState().finishProvider('claude')
    expect(useAiStore.getState().isLoading).toBe(false)
    expect(useAiStore.getState().results.claude.done).toBe(true)
  })

  it('subscribe detects when provider finishes', async () => {
    useAiStore.getState().startRequest(['claude'])

    let detected = false
    const unsub = useAiStore.subscribe((state) => {
      const result = state.results.claude
      if (result?.done && !result.error) {
        detected = true
        unsub()
      }
    })

    useAiStore.getState().appendChunk('claude', 'response text')
    useAiStore.getState().finishProvider('claude')

    expect(detected).toBe(true)
  })

  it('subscribe set up BEFORE finishProvider catches the event', () => {
    // This is the exact pattern used in handleInlineAiRequest
    useAiStore.getState().startRequest(['claude'])

    let capturedText = ''
    const unsub = useAiStore.subscribe((state) => {
      const result = state.results.claude
      if (result?.done && !result.error) {
        capturedText = result.text
        unsub()
      }
    })

    // Simulate streaming
    useAiStore.getState().appendChunk('claude', 'revised ')
    useAiStore.getState().appendChunk('claude', 'content')
    useAiStore.getState().finishProvider('claude')

    expect(capturedText).toBe('revised content')
  })

  it('subscribe set up AFTER finishProvider misses the event', () => {
    // This demonstrates the bug that was fixed
    useAiStore.getState().startRequest(['claude'])
    useAiStore.getState().appendChunk('claude', 'response')
    useAiStore.getState().finishProvider('claude')

    // Subscribe AFTER — should still detect since state is already done
    let detected = false
    const unsub = useAiStore.subscribe((state) => {
      const result = state.results.claude
      if (result?.done && !result.error) {
        detected = true
        unsub()
      }
    })

    // Subscribe only fires on CHANGES — the state is already done,
    // so this won't fire unless something else changes
    expect(detected).toBe(false) // This confirms the bug pattern
  })

  it('appendChunk on cancelled provider does not crash', () => {
    useAiStore.getState().startRequest(['claude'])
    useAiStore.getState().clearResults()

    // Late-arriving chunk after cancel — should not throw
    useAiStore.getState().appendChunk('claude', 'late chunk')
    expect(useAiStore.getState().results.claude).toBeUndefined()
  })

  it('retryProvider only resets one provider', () => {
    useAiStore.getState().startRequest(['claude', 'openai'])
    useAiStore.getState().appendChunk('claude', 'claude response')
    useAiStore.getState().finishProvider('claude')
    useAiStore.getState().appendChunk('openai', 'error')
    useAiStore.getState().finishProvider('openai', 'rate limited')

    // Retry only openai
    useAiStore.getState().retryProvider('openai')

    // Claude result should be preserved
    expect(useAiStore.getState().results.claude.text).toBe('claude response')
    expect(useAiStore.getState().results.claude.done).toBe(true)

    // OpenAI should be reset
    expect(useAiStore.getState().results.openai.text).toBe('')
    expect(useAiStore.getState().results.openai.done).toBe(false)
    expect(useAiStore.getState().isLoading).toBe(true)
  })

  it('showInlineDiff sets store state correctly', () => {
    useEditorStore.getState().showInlineDiff({
      file: '/test/file.tex',
      from: 10,
      to: 23,
      original: 'original text',
      suggested: 'improved text',
      comments: 'Made it better',
      provider: 'claude',
    })

    const diff = useEditorStore.getState().pendingInlineDiff
    expect(diff).not.toBeNull()
    expect(diff!.original).toBe('original text')
    expect(diff!.suggested).toBe('improved text')
    expect(diff!.comments).toBe('Made it better')
    expect(diff!.provider).toBe('claude')
  })

  it('acceptInlineDiff clears the pending diff', () => {
    useEditorStore.getState().showInlineDiff({
      file: '/test/file.tex', from: 0, to: 5,
      original: 'a', suggested: 'b', comments: '', provider: 'claude',
    })
    expect(useEditorStore.getState().pendingInlineDiff).not.toBeNull()

    useEditorStore.getState().acceptInlineDiff()
    expect(useEditorStore.getState().pendingInlineDiff).toBeNull()
  })

  it('rejectInlineDiff clears the pending diff', () => {
    useEditorStore.getState().showInlineDiff({
      file: '/test/file.tex', from: 0, to: 5,
      original: 'a', suggested: 'b', comments: '', provider: 'claude',
    })
    useEditorStore.getState().rejectInlineDiff()
    expect(useEditorStore.getState().pendingInlineDiff).toBeNull()
  })
})

describe('parseAiResponse', () => {
  it('parses structured response with all sections', () => {
    const text = `=== REVISED ===
improved text here

=== COMMENTS ===
- Changed this
- Fixed that

=== SUGGESTIONS ===
- Consider adding more`

    const parsed = parseAiResponse(text)
    expect(parsed.revised).toBe('improved text here')
    expect(parsed.comments).toContain('Changed this')
    expect(parsed.suggestions).toContain('Consider adding more')
  })

  it('returns raw text when no structured format', () => {
    const text = 'just plain text response'
    const parsed = parseAiResponse(text)
    expect(parsed.revised).toBe('')
    expect(parsed.raw).toBe('just plain text response')
  })

  it('handles missing sections gracefully', () => {
    const text = `=== REVISED ===
only revised section here`

    const parsed = parseAiResponse(text)
    expect(parsed.revised).toBe('only revised section here')
    expect(parsed.comments).toBe('')
    expect(parsed.suggestions).toBe('')
  })

  it('does not leave = characters in parsed sections', () => {
    const text = `=== REVISED ===
no equals signs should appear

=== COMMENTS ===
clean comments`

    const parsed = parseAiResponse(text)
    expect(parsed.revised).not.toMatch(/^=/)
    expect(parsed.comments).not.toMatch(/^=/)
  })
})

describe('stripCodeFences', () => {
  it('removes ```latex wrapper', () => {
    const text = '```latex\n\\section{Hello}\n```'
    expect(stripCodeFences(text)).toBe('\\section{Hello}')
  })

  it('removes plain ``` wrapper', () => {
    const text = '```\nsome code\n```'
    expect(stripCodeFences(text)).toBe('some code')
  })

  it('leaves plain text unchanged', () => {
    expect(stripCodeFences('plain text')).toBe('plain text')
  })

  it('handles text with no fences', () => {
    const text = 'The quick brown fox'
    expect(stripCodeFences(text)).toBe('The quick brown fox')
  })
})
