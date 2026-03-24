import { vi } from 'vitest'

// Mock electron module so electron-store and SettingsManager can run in tests
vi.mock('electron', () => ({
  default: {
    app: null,
    ipcMain: null,
    shell: null,
    safeStorage: {
      isEncryptionAvailable: () => false,
    },
  },
  app: null,
  ipcMain: null,
  shell: null,
  safeStorage: {
    isEncryptionAvailable: () => false,
  },
}))
