import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FileManager } from '../../electron/file-manager'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('FileManager', () => {
  let fm: FileManager
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-test-'))
    fm = new FileManager()
    fs.writeFileSync(path.join(tmpDir, 'main.tex'), '\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}')
    fs.mkdirSync(path.join(tmpDir, 'sections'))
    fs.writeFileSync(path.join(tmpDir, 'sections', 'intro.tex'), '\\section{Introduction}\nSome text.')
  })

  afterEach(() => {
    fm.stopWatching()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('scans a project directory into a tree', async () => {
    const tree = await fm.scanProject(tmpDir)
    expect(tree).toBeDefined()
    const names = tree.map(n => n.name)
    expect(names).toContain('main.tex')
    expect(names).toContain('sections')
  })

  it('reads a file', async () => {
    const content = await fm.readFile(path.join(tmpDir, 'main.tex'))
    expect(content).toContain('\\documentclass')
  })

  it('writes a file', async () => {
    const filePath = path.join(tmpDir, 'new.tex')
    await fm.writeFile(filePath, 'new content')
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content')
  })

  it('detects file changes via watcher', async () => {
    const changes: string[] = []
    fm.watch(tmpDir, (filePath) => changes.push(filePath))
    const target = path.join(tmpDir, 'main.tex')
    fs.writeFileSync(target, 'modified')
    await new Promise(r => setTimeout(r, 650))
    expect(changes.length).toBeGreaterThanOrEqual(1)
  })
})

describe('FileManager - findProjectPdf', () => {
  let fm: FileManager
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-pdf-'))
    fm = new FileManager()
  })

  afterEach(() => {
    fm.stopWatching()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('finds main.pdf in root directory', () => {
    const pdfPath = path.join(tmpDir, 'main.pdf')
    fs.writeFileSync(pdfPath, '%PDF-1.4 fake')
    const result = fm.findProjectPdf(tmpDir)
    expect(result).not.toBeNull()
    expect(result!.path).toBe(pdfPath)
    expect(result!.buffer).toBeDefined()
  })

  it('finds main.pdf in output subdirectory', () => {
    const outputDir = path.join(tmpDir, 'output')
    fs.mkdirSync(outputDir)
    const pdfPath = path.join(outputDir, 'main.pdf')
    fs.writeFileSync(pdfPath, '%PDF-1.4 fake')
    const result = fm.findProjectPdf(tmpDir)
    expect(result).not.toBeNull()
    expect(result!.path).toBe(pdfPath)
  })

  it('finds main.pdf in build subdirectory', () => {
    const buildDir = path.join(tmpDir, 'build')
    fs.mkdirSync(buildDir)
    const pdfPath = path.join(buildDir, 'main.pdf')
    fs.writeFileSync(pdfPath, '%PDF-1.4 fake')
    const result = fm.findProjectPdf(tmpDir)
    expect(result).not.toBeNull()
    expect(result!.path).toBe(pdfPath)
  })

  it('returns null when no PDF exists', () => {
    const result = fm.findProjectPdf(tmpDir)
    expect(result).toBeNull()
  })

  it('falls back to recursive search when named PDFs not found', () => {
    const deepDir = path.join(tmpDir, 'nested')
    fs.mkdirSync(deepDir)
    const pdfPath = path.join(deepDir, 'thesis.pdf')
    fs.writeFileSync(pdfPath, '%PDF-1.4 fake')
    const result = fm.findProjectPdf(tmpDir)
    expect(result).not.toBeNull()
    expect(result!.path).toBe(pdfPath)
  })
})

describe('FileManager - findPdfs respects maxDepth', () => {
  let fm: FileManager
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-depth-'))
    fm = new FileManager()
  })

  afterEach(() => {
    fm.stopWatching()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('finds PDF at depth 0 (root)', () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.pdf'), '%PDF')
    const found = fm.findPdfs(tmpDir, 0)
    expect(found.length).toBe(1)
    expect(found[0]).toContain('doc.pdf')
  })

  it('finds PDF at depth 1', () => {
    const subDir = path.join(tmpDir, 'sub')
    fs.mkdirSync(subDir)
    fs.writeFileSync(path.join(subDir, 'doc.pdf'), '%PDF')
    const found = fm.findPdfs(tmpDir, 1)
    expect(found.length).toBe(1)
  })

  it('does not find PDF beyond maxDepth', () => {
    const deep = path.join(tmpDir, 'a', 'b', 'c')
    fs.mkdirSync(deep, { recursive: true })
    fs.writeFileSync(path.join(deep, 'doc.pdf'), '%PDF')
    // With maxDepth=1, depth 3 should not be reached
    const found = fm.findPdfs(tmpDir, 1)
    expect(found.length).toBe(0)
  })

  it('finds multiple PDFs within depth', () => {
    const sub1 = path.join(tmpDir, 'sub1')
    const sub2 = path.join(tmpDir, 'sub2')
    fs.mkdirSync(sub1)
    fs.mkdirSync(sub2)
    fs.writeFileSync(path.join(sub1, 'a.pdf'), '%PDF')
    fs.writeFileSync(path.join(sub2, 'b.pdf'), '%PDF')
    const found = fm.findPdfs(tmpDir, 2)
    expect(found.length).toBe(2)
  })
})

describe('FileManager - searchInTexFiles deprioritizes backup directories', () => {
  let fm: FileManager
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-search-'))
    fm = new FileManager()
  })

  afterEach(() => {
    fm.stopWatching()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('finds text in a regular tex file', () => {
    fs.writeFileSync(path.join(tmpDir, 'main.tex'), 'This is the main introduction text.\n')
    const result = fm.searchInTexFiles(tmpDir, 'main introduction text')
    expect(result).not.toBeNull()
    expect(result!.file).toContain('main.tex')
  })

  it('returns null when text is not found', () => {
    fs.writeFileSync(path.join(tmpDir, 'main.tex'), 'Some unrelated content\n')
    const result = fm.searchInTexFiles(tmpDir, 'completely different phrase that does not exist')
    expect(result).toBeNull()
  })

  it('prefers regular directory over backup directory', () => {
    const backupDir = path.join(tmpDir, 'backup')
    fs.mkdirSync(backupDir)
    // Both files contain the same text
    const sharedText = 'unique searchable phrase for testing purposes'
    fs.writeFileSync(path.join(tmpDir, 'main.tex'), sharedText + '\n')
    fs.writeFileSync(path.join(backupDir, 'main.tex'), sharedText + '\n')
    const result = fm.searchInTexFiles(tmpDir, sharedText)
    expect(result).not.toBeNull()
    // Should find in the non-backup file first
    expect(result!.file).not.toContain('backup')
  })

  it('returns backup directory result when only backup has the text', () => {
    const backupDir = path.join(tmpDir, 'backup')
    fs.mkdirSync(backupDir)
    fs.writeFileSync(path.join(tmpDir, 'main.tex'), 'unrelated content here\n')
    fs.writeFileSync(path.join(backupDir, 'archived.tex'), 'backup only text content here\n')
    const result = fm.searchInTexFiles(tmpDir, 'backup only text content')
    expect(result).not.toBeNull()
    expect(result!.file).toContain('backup')
  })
})
