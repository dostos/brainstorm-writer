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
