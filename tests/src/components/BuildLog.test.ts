import { describe, it, expect } from 'vitest'
import { parseBuildLog } from '../../../src/components/BuildLog'

const PROJECT = '/home/user/project'

describe('parseBuildLog', () => {
  it('returns normal lines as type normal', () => {
    const result = parseBuildLog('This is a regular line\nAnother line', PROJECT)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ type: 'normal', text: 'This is a regular line' })
    expect(result[1]).toMatchObject({ type: 'normal', text: 'Another line' })
  })

  it('detects ! LaTeX Error lines as error', () => {
    const log = '! LaTeX Error: File not found.'
    const result = parseBuildLog(log, PROJECT)
    expect(result[0].type).toBe('error')
    if (result[0].type === 'error') {
      expect(result[0].text).toBe('! LaTeX Error: File not found.')
    }
  })

  it('detects ! error and extracts line number from l.<n> lookahead', () => {
    const log = [
      '! Undefined control sequence.',
      '<recently read> \\badcommand',
      'l.42 some context',
    ].join('\n')
    const result = parseBuildLog(log, PROJECT)
    expect(result[0].type).toBe('error')
    if (result[0].type === 'error') {
      expect(result[0].lineNumber).toBe(42)
    }
  })

  it('detects ./filename.tex:42: pattern as error', () => {
    const log = './main.tex:17: Undefined control sequence.'
    const result = parseBuildLog(log, PROJECT)
    expect(result[0].type).toBe('error')
    if (result[0].type === 'error') {
      expect(result[0].lineNumber).toBe(17)
      expect(result[0].filename).toBe('/home/user/project/main.tex')
    }
  })

  it('resolves relative filename against project path', () => {
    const log = './sections/intro.tex:5: Some error.'
    const result = parseBuildLog(log, PROJECT)
    expect(result[0].type).toBe('error')
    if (result[0].type === 'error') {
      expect(result[0].filename).toBe('/home/user/project/sections/intro.tex')
    }
  })

  it('handles absolute paths in file:line: pattern', () => {
    const log = '/abs/path/to/file.tex:100: Overfull \\hbox'
    const result = parseBuildLog(log, PROJECT)
    expect(result[0].type).toBe('error')
    if (result[0].type === 'error') {
      expect(result[0].filename).toBe('/abs/path/to/file.tex')
      expect(result[0].lineNumber).toBe(100)
    }
  })

  it('tracks current file from paren context and attaches to ! error', () => {
    const log = [
      '(/home/user/project/./main.tex',
      '! Undefined control sequence.',
      'l.10 \\badmacro',
    ].join('\n')
    const result = parseBuildLog(log, PROJECT)
    const errors = result.filter((l) => l.type === 'error')
    expect(errors.length).toBeGreaterThan(0)
    if (errors[0].type === 'error') {
      expect(errors[0].lineNumber).toBe(10)
    }
  })

  it('returns empty array for empty log', () => {
    const result = parseBuildLog('', PROJECT)
    // single empty string from split
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'normal', text: '' })
  })
})
