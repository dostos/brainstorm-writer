import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '../../../src/stores/editor-store'

describe('editor-store', () => {
  beforeEach(() => {
    useEditorStore.setState(useEditorStore.getInitialState())
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
})
