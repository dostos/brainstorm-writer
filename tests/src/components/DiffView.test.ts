import { describe, it, expect } from 'vitest'
import { diffWords } from 'diff'

describe('DiffView logic', () => {
  it('detects word-level changes', () => {
    const changes = diffWords('The quick brown fox', 'The fast brown dog')
    const added = changes.filter(c => c.added).map(c => c.value)
    const removed = changes.filter(c => c.removed).map(c => c.value)
    expect(added).toContain('fast')
    expect(added).toContain('dog')
    expect(removed).toContain('quick')
    expect(removed).toContain('fox')
  })

  it('returns no changes for identical text', () => {
    const changes = diffWords('same text', 'same text')
    expect(changes.every(c => !c.added && !c.removed)).toBe(true)
  })
})
