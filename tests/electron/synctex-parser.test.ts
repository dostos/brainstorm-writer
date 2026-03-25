import { describe, it, expect } from 'vitest'
import { SynctexParser, SynctexData } from '../../electron/synctex-parser'
import fs from 'fs'
import path from 'path'
import os from 'os'

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

describe('SynctexParser.parseContent - new format with sp→pt conversion', () => {
  const parser = new SynctexParser()
  const SP_TO_PT = 65536

  // Helper: write a temp synctex file and parse it
  function parseSynctexContent(content: string): SynctexData {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synctex-test-'))
    const tmpFile = path.join(tmpDir, 'test.synctex')
    fs.writeFileSync(tmpFile, content, 'utf-8')
    // Use parse() which calls parseContent internally
    // But since parse() is async, we test via a sync helper below
    // Instead we call the public parse method
    fs.rmSync(tmpDir, { recursive: true, force: true })
    // We cannot call private parseContent directly, so we parse via a real file
    // Re-create and return via parse()
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'synctex-test2-'))
    const tmpFile2 = path.join(tmpDir2, 'test.synctex')
    fs.writeFileSync(tmpFile2, content, 'utf-8')
    return { tmpFile: tmpFile2, tmpDir: tmpDir2 } as any
  }

  it('parses new format h<fileId>,<line>:<x>,<y>:<w>,<h>,<d> and converts sp to pt', async () => {
    const xSp = 4736286
    const ySp = 4736286
    const wSp = 0
    const hSp = 0

    const content = [
      'SyncTeX Version:1',
      'Input:1:/path/to/main.tex',
      '{1',
      `h1,13:${xSp},${ySp}:${wSp},${hSp},0`,
      '}',
    ].join('\n')

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synctex-parse-'))
    const tmpFile = path.join(tmpDir, 'test.synctex')
    fs.writeFileSync(tmpFile, content, 'utf-8')

    try {
      const data = await parser.parse(tmpFile)
      expect(data.entries).toHaveLength(1)
      const entry = data.entries[0]
      expect(entry.page).toBe(1)
      expect(entry.line).toBe(13)
      expect(entry.file).toBe('/path/to/main.tex')
      // sp → pt: divide by 65536
      expect(entry.x).toBeCloseTo(xSp / SP_TO_PT, 5)
      expect(entry.y).toBeCloseTo(ySp / SP_TO_PT, 5)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('sp to pt conversion: 65536 sp equals exactly 1 pt', async () => {
    const content = [
      'SyncTeX Version:1',
      'Input:1:/path/to/doc.tex',
      '{1',
      `h1,5:${65536},${65536 * 2}:${65536 * 3},${65536},0`,
      '}',
    ].join('\n')

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synctex-sp-'))
    const tmpFile = path.join(tmpDir, 'test.synctex')
    fs.writeFileSync(tmpFile, content, 'utf-8')

    try {
      const data = await parser.parse(tmpFile)
      expect(data.entries).toHaveLength(1)
      const entry = data.entries[0]
      expect(entry.x).toBe(1)   // 65536 sp = 1 pt
      expect(entry.y).toBe(2)   // 131072 sp = 2 pt
      expect(entry.width).toBe(3)  // 196608 sp = 3 pt
      expect(entry.height).toBe(1) // 65536 sp = 1 pt
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('parses file with multiple entries on multiple pages', async () => {
    const content = [
      'SyncTeX Version:1',
      'Input:1:/path/to/intro.tex',
      'Input:2:/path/to/method.tex',
      '{1',
      `h1,5:${65536 * 10},${65536 * 20}:${65536 * 5},${65536},0`,
      `h2,15:${65536 * 12},${65536 * 30}:${65536 * 5},${65536},0`,
      '}',
      '{2',
      `h1,25:${65536 * 8},${65536 * 15}:${65536 * 5},${65536},0`,
      '}',
    ].join('\n')

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synctex-multi-'))
    const tmpFile = path.join(tmpDir, 'test.synctex')
    fs.writeFileSync(tmpFile, content, 'utf-8')

    try {
      const data = await parser.parse(tmpFile)
      expect(data.entries).toHaveLength(3)
      expect(data.files).toContain('/path/to/intro.tex')
      expect(data.files).toContain('/path/to/method.tex')

      const page1entries = data.entries.filter(e => e.page === 1)
      const page2entries = data.entries.filter(e => e.page === 2)
      expect(page1entries).toHaveLength(2)
      expect(page2entries).toHaveLength(1)
      expect(page2entries[0].file).toBe('/path/to/intro.tex')
      expect(page2entries[0].line).toBe(25)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('ignores entries with line number 0', async () => {
    const content = [
      'SyncTeX Version:1',
      'Input:1:/path/to/main.tex',
      '{1',
      // line 0 should be ignored
      `h1,0:${65536},${65536}:${65536},${65536},0`,
      // line > 0 should be included
      `h1,5:${65536},${65536}:${65536},${65536},0`,
      '}',
    ].join('\n')

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synctex-line0-'))
    const tmpFile = path.join(tmpDir, 'test.synctex')
    fs.writeFileSync(tmpFile, content, 'utf-8')

    try {
      const data = await parser.parse(tmpFile)
      expect(data.entries).toHaveLength(1)
      expect(data.entries[0].line).toBe(5)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
