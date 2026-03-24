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
