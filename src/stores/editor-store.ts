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
  pendingReplacement: string | null
  replacementRange: { from: number; to: number } | null
  pendingJumpLine: number | null
  pendingPdfJump: { page: number; y: number } | null
  dirtyFiles: Set<string>
  setActiveFile: (file: string) => void
  setSelection: (selection: Selection | null) => void
  openFile: (file: string) => void
  closeFile: (file: string) => void
  replaceSelection: (text: string, from?: number, to?: number) => void
  clearReplacement: () => void
  jumpToLine: (line: number) => void
  clearJump: () => void
  jumpToPdf: (page: number, y: number) => void
  clearPdfJump: () => void
  markDirty: (file: string) => void
  markClean: (file: string) => void
}

export const useEditorStore = create<EditorState>()((set) => ({
  activeFile: null,
  openFiles: [],
  selection: null,
  pendingReplacement: null,
  replacementRange: null,
  pendingJumpLine: null,
  pendingPdfJump: null,
  dirtyFiles: new Set<string>(),
  setActiveFile: (file) => set({ activeFile: file }),
  setSelection: (selection) => set({ selection }),
  openFile: (file) =>
    set((state) => ({
      openFiles: state.openFiles.includes(file) ? state.openFiles : [...state.openFiles, file],
      activeFile: file,
    })),
  closeFile: (file) =>
    set((state) => {
      const newDirty = new Set(state.dirtyFiles)
      newDirty.delete(file)
      return {
        openFiles: state.openFiles.filter((f) => f !== file),
        activeFile: state.activeFile === file ? state.openFiles.find((f) => f !== file) || null : state.activeFile,
        dirtyFiles: newDirty,
      }
    }),
  replaceSelection: (text, from?, to?) => set({ pendingReplacement: text, replacementRange: from !== undefined ? { from, to: to! } : null }),
  clearReplacement: () => set({ pendingReplacement: null, replacementRange: null }),
  jumpToLine: (line) => set({ pendingJumpLine: line }),
  clearJump: () => set({ pendingJumpLine: null }),
  jumpToPdf: (page, y) => set({ pendingPdfJump: { page, y } }),
  clearPdfJump: () => set({ pendingPdfJump: null }),
  markDirty: (file) =>
    set((state) => {
      const newDirty = new Set(state.dirtyFiles)
      newDirty.add(file)
      return { dirtyFiles: newDirty }
    }),
  markClean: (file) =>
    set((state) => {
      const newDirty = new Set(state.dirtyFiles)
      newDirty.delete(file)
      return { dirtyFiles: newDirty }
    }),
}))
