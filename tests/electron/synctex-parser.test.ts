import { describe, it, expect } from 'vitest'
import { SynctexParser, SynctexData } from '../../electron/synctex-parser'

describe('SynctexParser', () => {
  const parser = new SynctexParser()

  const mockData: SynctexData = {
    entries: [
      { page: 1, x: 100, y: 200, width: 400, height: 12, file: 'intro.tex', line: 5 },
      { page: 1, x: 100, y: 220, width: 400, height: 12, file: 'intro.tex', line: 6 },
      { page: 1, x: 100, y: 250, width: 400, height: 12, file: 'method.tex', line: 10 },
      { page: 2, x: 100, y: 100, width: 400, height: 12, file: 'method.tex', line: 25 },
    ],
    files: ['intro.tex', 'method.tex'],
  }

  it('forward search: finds PDF location for a source line', () => {
    const result = parser.forwardSearch(mockData, 'intro.tex', 5)
    expect(result).toBeDefined()
    expect(result!.page).toBe(1)
    expect(result!.y).toBe(200)
  })

  it('inverse search: finds source line for PDF coordinates', () => {
    const result = parser.inverseSearch(mockData, 1, 150, 205)
    expect(result).toBeDefined()
    expect(result!.file).toBe('intro.tex')
    expect(result!.line).toBe(5)
  })

  it('inverse search returns closest match within threshold', () => {
    const result = parser.inverseSearch(mockData, 1, 150, 218)
    expect(result).toBeDefined()
    expect(result!.file).toBe('intro.tex')
    expect(result!.line).toBe(6)
  })

  it('returns null for unmatched forward search', () => {
    const result = parser.forwardSearch(mockData, 'nonexistent.tex', 1)
    expect(result).toBeNull()
  })

  it('returns null for unmatched inverse search (wrong page)', () => {
    const result = parser.inverseSearch(mockData, 99, 100, 200)
    expect(result).toBeNull()
  })
})
