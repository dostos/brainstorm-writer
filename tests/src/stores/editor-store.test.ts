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
}

describe('editor-store', () => {
  beforeEach(() => {
    useEditorStore.setState(initialState)
  })

  it('sets active file', () => {
    useEditorStore.getState().setActiveFile('/path/intro.tex')
    expect(useEditorStore.getState().activeFile).toBe('/path/intro.tex')
  })

  it('sets selection', () => {
    useEditorStore.getState().setSelection({ text: 'hello', from: 10, to: 15 })
    expect(useEditorStore.getState().selection?.text).toBe('hello')
  })

  it('tracks open files', () => {
    useEditorStore.getState().openFile('/path/a.tex')
    useEditorStore.getState().openFile('/path/b.tex')
    expect(useEditorStore.getState().openFiles).toEqual(['/path/a.tex', '/path/b.tex'])
  })

  it('does not duplicate open files', () => {
    useEditorStore.getState().openFile('/path/a.tex')
    useEditorStore.getState().openFile('/path/a.tex')
    expect(useEditorStore.getState().openFiles).toEqual(['/path/a.tex'])
  })

  it('closes a file', () => {
    useEditorStore.getState().openFile('/path/a.tex')
    useEditorStore.getState().openFile('/path/b.tex')
    useEditorStore.getState().closeFile('/path/a.tex')
    expect(useEditorStore.getState().openFiles).toEqual(['/path/b.tex'])
  })

  // Tab switching tests
  it('openFile sets activeFile to the opened file', () => {
    useEditorStore.getState().openFile('/path/a.tex')
    expect(useEditorStore.getState().activeFile).toBe('/path/a.tex')
    useEditorStore.getState().openFile('/path/b.tex')
    expect(useEditorStore.getState().activeFile).toBe('/path/b.tex')
  })

  it('switching tabs with setActiveFile does not change openFiles', () => {
    useEditorStore.getState().openFile('/path/a.tex')
    useEditorStore.getState().openFile('/path/b.tex')
    useEditorStore.getState().setActiveFile('/path/a.tex')
    expect(useEditorStore.getState().activeFile).toBe('/path/a.tex')
    expect(useEditorStore.getState().openFiles).toEqual(['/path/a.tex', '/path/b.tex'])
  })

  it('closing active file switches to another open file', () => {
    useEditorStore.getState().openFile('/path/a.tex')
    useEditorStore.getState().openFile('/path/b.tex')
    useEditorStore.getState().setActiveFile('/path/b.tex')
    useEditorStore.getState().closeFile('/path/b.tex')
    expect(useEditorStore.getState().activeFile).toBe('/path/a.tex')
  })

  it('closing last file sets activeFile to null', () => {
    useEditorStore.getState().openFile('/path/a.tex')
    useEditorStore.getState().closeFile('/path/a.tex')
    expect(useEditorStore.getState().activeFile).toBeNull()
  })

  // Dirty files tests
  it('markDirty adds file to dirtyFiles', () => {
    useEditorStore.getState().markDirty('/path/a.tex')
    expect(useEditorStore.getState().dirtyFiles.has('/path/a.tex')).toBe(true)
  })

  it('markClean removes file from dirtyFiles', () => {
    useEditorStore.getState().markDirty('/path/a.tex')
    useEditorStore.getState().markClean('/path/a.tex')
    expect(useEditorStore.getState().dirtyFiles.has('/path/a.tex')).toBe(false)
  })

  it('closing a dirty file removes it from dirtyFiles', () => {
    useEditorStore.getState().openFile('/path/a.tex')
    useEditorStore.getState().markDirty('/path/a.tex')
    useEditorStore.getState().closeFile('/path/a.tex')
    expect(useEditorStore.getState().dirtyFiles.has('/path/a.tex')).toBe(false)
  })

  // Selection replacement tests
  it('replaceSelection with range stores replacement and range', () => {
    useEditorStore.getState().replaceSelection('new text', 5, 10)
    expect(useEditorStore.getState().pendingReplacement).toBe('new text')
    expect(useEditorStore.getState().replacementRange).toEqual({ from: 5, to: 10 })
  })

  it('clearReplacement clears both pending values', () => {
    useEditorStore.getState().replaceSelection('new text', 5, 10)
    useEditorStore.getState().clearReplacement()
    expect(useEditorStore.getState().pendingReplacement).toBeNull()
    expect(useEditorStore.getState().replacementRange).toBeNull()
  })

  // Jump tests
  it('jumpToLine sets and clears correctly', () => {
    useEditorStore.getState().jumpToLine(42)
    expect(useEditorStore.getState().pendingJumpLine).toBe(42)
    useEditorStore.getState().clearJump()
    expect(useEditorStore.getState().pendingJumpLine).toBeNull()
  })

  // Rapid tab switching — state consistency
  it('rapid open/switch maintains correct state', () => {
    const { openFile, setActiveFile } = useEditorStore.getState()
    openFile('/path/a.tex')
    openFile('/path/b.tex')
    openFile('/path/c.tex')
    setActiveFile('/path/a.tex')
    setActiveFile('/path/c.tex')
    setActiveFile('/path/b.tex')

    const state = useEditorStore.getState()
    expect(state.activeFile).toBe('/path/b.tex')
    expect(state.openFiles).toEqual(['/path/a.tex', '/path/b.tex', '/path/c.tex'])
  })
})
