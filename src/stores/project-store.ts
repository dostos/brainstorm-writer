import { create } from 'zustand'

interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

interface ProjectState {
  projectPath: string | null
  fileTree: FileNode[]
  setProject: (path: string, tree: FileNode[]) => void
  clearProject: () => void
}

export const useProjectStore = create<ProjectState>()((set) => ({
  projectPath: null,
  fileTree: [],
  setProject: (path, tree) => set({ projectPath: path, fileTree: tree }),
  clearProject: () => set({ projectPath: null, fileTree: [] }),
}))
