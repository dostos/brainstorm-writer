import { describe, it, expect, beforeEach } from 'vitest'
import { useProjectStore } from '../../../src/stores/project-store'

const initialState = {
  projectPath: null,
  fileTree: [],
}

describe('project-store', () => {
  beforeEach(() => {
    useProjectStore.setState(initialState)
  })

  it('initial state has null projectPath and empty fileTree', () => {
    const state = useProjectStore.getState()
    expect(state.projectPath).toBeNull()
    expect(state.fileTree).toEqual([])
  })

  it('setProject sets the path and tree', () => {
    const tree = [
      { name: 'main.tex', path: '/proj/main.tex', isDirectory: false },
      { name: 'sections', path: '/proj/sections', isDirectory: true, children: [] },
    ]
    useProjectStore.getState().setProject('/proj', tree)
    const state = useProjectStore.getState()
    expect(state.projectPath).toBe('/proj')
    expect(state.fileTree).toHaveLength(2)
    expect(state.fileTree[0].name).toBe('main.tex')
  })

  it('setProject replaces an existing project', () => {
    useProjectStore.getState().setProject('/old-proj', [
      { name: 'old.tex', path: '/old-proj/old.tex', isDirectory: false },
    ])
    useProjectStore.getState().setProject('/new-proj', [
      { name: 'new.tex', path: '/new-proj/new.tex', isDirectory: false },
    ])
    const state = useProjectStore.getState()
    expect(state.projectPath).toBe('/new-proj')
    expect(state.fileTree[0].name).toBe('new.tex')
  })

  it('clearProject resets projectPath to null', () => {
    useProjectStore.getState().setProject('/proj', [
      { name: 'main.tex', path: '/proj/main.tex', isDirectory: false },
    ])
    useProjectStore.getState().clearProject()
    expect(useProjectStore.getState().projectPath).toBeNull()
  })

  it('clearProject resets fileTree to empty array', () => {
    useProjectStore.getState().setProject('/proj', [
      { name: 'main.tex', path: '/proj/main.tex', isDirectory: false },
    ])
    useProjectStore.getState().clearProject()
    expect(useProjectStore.getState().fileTree).toEqual([])
  })

  it('setProject with nested children preserves structure', () => {
    const tree = [
      {
        name: 'chapters',
        path: '/proj/chapters',
        isDirectory: true,
        children: [
          { name: 'intro.tex', path: '/proj/chapters/intro.tex', isDirectory: false },
        ],
      },
    ]
    useProjectStore.getState().setProject('/proj', tree)
    const node = useProjectStore.getState().fileTree[0]
    expect(node.isDirectory).toBe(true)
    expect(node.children).toHaveLength(1)
    expect(node.children![0].name).toBe('intro.tex')
  })
})
