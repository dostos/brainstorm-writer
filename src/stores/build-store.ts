import { create } from 'zustand'

type BuildStatus = 'idle' | 'building' | 'success' | 'error'

interface BuildState {
  status: BuildStatus
  logs: string
  appendLog: (data: string) => void
  clearLogs: () => void
  setStatus: (status: BuildStatus) => void
}

export const useBuildStore = create<BuildState>()((set) => ({
  status: 'idle',
  logs: '',
  appendLog: (data) => set((state) => ({ logs: state.logs + data })),
  clearLogs: () => set({ logs: '' }),
  setStatus: (status) => set({ status }),
}))
