import { create } from 'zustand'

interface Selection {
  text: string
  from: number
  to: number
}

interface EditorState {
  activeFile: string | null
  openFiles: string[]
  selection: Selection | null
  setActiveFile: (file: string) => void
  setSelection: (selection: Selection | null) => void
  openFile: (file: string) => void
  closeFile: (file: string) => void
}

export const useEditorStore = create<EditorState>()((set) => ({
  activeFile: null,
  openFiles: [],
  selection: null,
  setActiveFile: (file) => set({ activeFile: file }),
  setSelection: (selection) => set({ selection }),
  openFile: (file) =>
    set((state) => ({
      openFiles: state.openFiles.includes(file) ? state.openFiles : [...state.openFiles, file],
      activeFile: file,
    })),
  closeFile: (file) =>
    set((state) => ({
      openFiles: state.openFiles.filter((f) => f !== file),
      activeFile: state.activeFile === file ? state.openFiles.find((f) => f !== file) || null : state.activeFile,
    })),
}))
