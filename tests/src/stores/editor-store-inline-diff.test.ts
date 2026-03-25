import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '../../../src/stores/editor-store'

const initialState = {
  activeFile: null,
  openFiles: [],
  selection: null,
  pendingReplacement: null,
  replacementRange: null,
  pendingJumpLine: null,
  pendingPdfJump: null,
  dirtyFiles: new Set<string>(),
  pendingInlineDiff: null,
}

const sampleDiff = {
  file: '/test/file.tex',
  from: 10,
  to: 30,
  original: 'original text',
  suggested: 'improved text',
  comments: 'Made it better',
  provider: 'claude',
}

describe('editor-store inline diff', () => {
  beforeEach(() => {
    useEditorStore.setState(initialState)
  })

  it('showInlineDiff sets pendingInlineDiff', () => {
    useEditorStore.getState().showInlineDiff(sampleDiff)
    const diff = useEditorStore.getState().pendingInlineDiff
    expect(diff).not.toBeNull()
    expect(diff!.original).toBe('original text')
    expect(diff!.suggested).toBe('improved text')
    expect(diff!.comments).toBe('Made it better')
    expect(diff!.provider).toBe('claude')
    expect(diff!.from).toBe(10)
    expect(diff!.to).toBe(30)
  })

  it('showInlineDiff replaces any previous pending diff', () => {
    useEditorStore.getState().showInlineDiff(sampleDiff)
    useEditorStore.getState().showInlineDiff({ ...sampleDiff, suggested: 'another suggestion', provider: 'openai' })
    const diff = useEditorStore.getState().pendingInlineDiff
    expect(diff!.suggested).toBe('another suggestion')
    expect(diff!.provider).toBe('openai')
  })

  it('acceptInlineDiff sets pendingInlineDiff to null', () => {
    useEditorStore.getState().showInlineDiff(sampleDiff)
    expect(useEditorStore.getState().pendingInlineDiff).not.toBeNull()
    useEditorStore.getState().acceptInlineDiff()
    expect(useEditorStore.getState().pendingInlineDiff).toBeNull()
  })

  it('rejectInlineDiff sets pendingInlineDiff to null', () => {
    useEditorStore.getState().showInlineDiff(sampleDiff)
    expect(useEditorStore.getState().pendingInlineDiff).not.toBeNull()
    useEditorStore.getState().rejectInlineDiff()
    expect(useEditorStore.getState().pendingInlineDiff).toBeNull()
  })

  it('acceptInlineDiff is safe to call when no diff is pending', () => {
    expect(useEditorStore.getState().pendingInlineDiff).toBeNull()
    expect(() => useEditorStore.getState().acceptInlineDiff()).not.toThrow()
    expect(useEditorStore.getState().pendingInlineDiff).toBeNull()
  })

  it('rejectInlineDiff is safe to call when no diff is pending', () => {
    expect(useEditorStore.getState().pendingInlineDiff).toBeNull()
    expect(() => useEditorStore.getState().rejectInlineDiff()).not.toThrow()
    expect(useEditorStore.getState().pendingInlineDiff).toBeNull()
  })
})

describe('editor-store replaceSelection', () => {
  beforeEach(() => {
    useEditorStore.setState(initialState)
  })

  it('replaceSelection with from and to sets replacementRange', () => {
    useEditorStore.getState().replaceSelection('new content', 5, 20)
    const state = useEditorStore.getState()
    expect(state.pendingReplacement).toBe('new content')
    expect(state.replacementRange).toEqual({ from: 5, to: 20 })
  })

  it('replaceSelection without from/to sets replacementRange to null', () => {
    useEditorStore.getState().replaceSelection('new content')
    const state = useEditorStore.getState()
    expect(state.pendingReplacement).toBe('new content')
    expect(state.replacementRange).toBeNull()
  })

  it('replaceSelection replaces existing replacement', () => {
    useEditorStore.getState().replaceSelection('first', 0, 5)
    useEditorStore.getState().replaceSelection('second', 10, 20)
    const state = useEditorStore.getState()
    expect(state.pendingReplacement).toBe('second')
    expect(state.replacementRange).toEqual({ from: 10, to: 20 })
  })
})
