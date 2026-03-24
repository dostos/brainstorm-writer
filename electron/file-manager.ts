import fs from 'fs'
import path from 'path'

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

export class FileManager {
  private watcher: fs.FSWatcher | null = null

  async scanProject(dirPath: string): Promise<FileNode[]> {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    const nodes: FileNode[] = []
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(dirPath, entry.name)
      const node: FileNode = {
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
      }
      if (entry.isDirectory()) {
        node.children = await this.scanProject(fullPath)
      }
      nodes.push(node)
    }
    return nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  async readFile(filePath: string): Promise<string> {
    return fs.readFileSync(filePath, 'utf-8')
  }

  async readFileBuffer(filePath: string): Promise<Buffer> {
    return fs.readFileSync(filePath)
  }

  findProjectPdf(projectPath: string): { path: string; buffer: Buffer } | null {
    const names = ['main.pdf', 'output.pdf', 'paper.pdf']
    const dirs = ['', 'output', 'build', 'out', '_build']
    for (const dir of dirs) {
      for (const name of names) {
        const pdfPath = dir ? path.join(projectPath, dir, name) : path.join(projectPath, name)
        try {
          const buffer = fs.readFileSync(pdfPath)
          return { path: pdfPath, buffer }
        } catch { /* not found, try next */ }
      }
    }
    // Fallback: recursive .pdf search
    const found = this.findPdfs(projectPath)
    if (found.length > 0) {
      try {
        const buffer = fs.readFileSync(found[0])
        return { path: found[0], buffer }
      } catch { /* unreadable */ }
    }
    return null
  }

  findPdfs(dirPath: string, maxDepth = 2): string[] {
    const results: string[] = []
    this.findPdfsRecursive(dirPath, results, 0, maxDepth)
    return results
  }

  private findPdfsRecursive(dirPath: string, results: string[], depth: number, maxDepth: number): void {
    if (depth > maxDepth) return
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const fullPath = path.join(dirPath, entry.name)
        if (entry.isFile() && entry.name.endsWith('.pdf')) {
          results.push(fullPath)
        } else if (entry.isDirectory() && depth < maxDepth) {
          this.findPdfsRecursive(fullPath, results, depth + 1, maxDepth)
        }
      }
    } catch { /* permission error etc */ }
  }

  // Search for text in .tex files, return { file, line } of first match
  searchInTexFiles(dirPath: string, searchText: string): { file: string; line: number } | null {
    const texFiles = this.findTexFiles(dirPath)
    // Normalize: collapse whitespace for fuzzy matching
    const needle = searchText.replace(/\s+/g, ' ').trim()
    // Try progressively shorter snippets (first 80 chars, 40, 20)
    for (const len of [needle.length, 80, 40, 20]) {
      const snippet = needle.slice(0, len)
      if (snippet.length < 5) continue
      for (const file of texFiles) {
        try {
          const content = fs.readFileSync(file, 'utf-8')
          const normalizedContent = content.replace(/\s+/g, ' ')
          const idx = normalizedContent.indexOf(snippet)
          if (idx !== -1) {
            // Find line number
            const beforeMatch = content.slice(0, content.indexOf(searchText.slice(0, 20)) !== -1
              ? content.indexOf(searchText.slice(0, 20))
              : idx)
            const line = (beforeMatch.match(/\n/g) || []).length + 1
            return { file, line }
          }
        } catch { /* skip unreadable */ }
      }
    }
    return null
  }

  private findTexFiles(dirPath: string, maxDepth = 3): string[] {
    const results: string[] = []
    this.findTexFilesRecursive(dirPath, results, 0, maxDepth)
    return results
  }

  private findTexFilesRecursive(dirPath: string, results: string[], depth: number, maxDepth: number): void {
    if (depth > maxDepth) return
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const fullPath = path.join(dirPath, entry.name)
        if (entry.isFile() && entry.name.endsWith('.tex')) {
          results.push(fullPath)
        } else if (entry.isDirectory()) {
          this.findTexFilesRecursive(fullPath, results, depth + 1, maxDepth)
        }
      }
    } catch { /* permission error */ }
  }

  fileExists(filePath: string): boolean {
    return fs.existsSync(filePath)
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    fs.writeFileSync(filePath, content, 'utf-8')
  }

  watch(dirPath: string, onChange: (filePath: string) => void): void {
    this.stopWatching()
    this.watcher = fs.watch(dirPath, { recursive: true }, (_event, filename) => {
      if (filename) {
        onChange(path.join(dirPath, filename))
      }
    })
  }

  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }
}
