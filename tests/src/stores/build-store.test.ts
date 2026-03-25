import { describe, it, expect, beforeEach } from 'vitest'
import { useBuildStore } from '../../../src/stores/build-store'

const initialState = {
  status: 'idle' as const,
  logs: '',
}

describe('build-store', () => {
  beforeEach(() => {
    useBuildStore.setState(initialState)
  })

  it('initial status is idle', () => {
    expect(useBuildStore.getState().status).toBe('idle')
  })

  it('initial logs are empty', () => {
    expect(useBuildStore.getState().logs).toBe('')
  })

  it('appendLog accumulates text', () => {
    useBuildStore.getState().appendLog('line 1\n')
    useBuildStore.getState().appendLog('line 2\n')
    expect(useBuildStore.getState().logs).toBe('line 1\nline 2\n')
  })

  it('appendLog does not reset previous log content', () => {
    useBuildStore.getState().appendLog('first chunk')
    useBuildStore.getState().appendLog(' second chunk')
    expect(useBuildStore.getState().logs).toBe('first chunk second chunk')
  })

  it('clearLogs resets logs to empty string', () => {
    useBuildStore.getState().appendLog('some build output\n')
    useBuildStore.getState().clearLogs()
    expect(useBuildStore.getState().logs).toBe('')
  })

  it('clearLogs does not affect status', () => {
    useBuildStore.getState().setStatus('building')
    useBuildStore.getState().clearLogs()
    expect(useBuildStore.getState().status).toBe('building')
  })

  it('setStatus changes status to building', () => {
    useBuildStore.getState().setStatus('building')
    expect(useBuildStore.getState().status).toBe('building')
  })

  it('setStatus changes status to success', () => {
    useBuildStore.getState().setStatus('success')
    expect(useBuildStore.getState().status).toBe('success')
  })

  it('setStatus changes status to error', () => {
    useBuildStore.getState().setStatus('error')
    expect(useBuildStore.getState().status).toBe('error')
  })

  it('setStatus can reset back to idle', () => {
    useBuildStore.getState().setStatus('building')
    useBuildStore.getState().setStatus('idle')
    expect(useBuildStore.getState().status).toBe('idle')
  })

  it('full build lifecycle: idle → building → success', () => {
    expect(useBuildStore.getState().status).toBe('idle')
    useBuildStore.getState().setStatus('building')
    useBuildStore.getState().appendLog('Compiling...\n')
    useBuildStore.getState().setStatus('success')
    useBuildStore.getState().appendLog('Done.\n')
    expect(useBuildStore.getState().status).toBe('success')
    expect(useBuildStore.getState().logs).toBe('Compiling...\nDone.\n')
  })
})
