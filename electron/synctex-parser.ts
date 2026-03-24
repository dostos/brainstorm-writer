import fs from 'fs'
import zlib from 'zlib'
import path from 'path'

export interface SynctexEntry {
  page: number
  x: number
  y: number
  width: number
  height: number
  file: string
  line: number
}

export interface SynctexData {
  entries: SynctexEntry[]
  files: string[]
}

interface ForwardResult {
  page: number
  x: number
  y: number
}

interface InverseResult {
  file: string
  line: number
}

export class SynctexParser {
  async parse(synctexPath: string): Promise<SynctexData> {
    let content: string
    if (synctexPath.endsWith('.gz')) {
      const compressed = fs.readFileSync(synctexPath)
      content = zlib.gunzipSync(compressed).toString('utf-8')
    } else {
      content = fs.readFileSync(synctexPath, 'utf-8')
    }
    return this.parseContent(content, path.dirname(synctexPath))
  }

  private parseContent(content: string, basePath: string): SynctexData {
    const lines = content.split('\n')
    const files: string[] = []
    const entries: SynctexEntry[] = []
    let currentPage = 0
    const fileMap: Record<number, string> = {}

    for (const line of lines) {
      if (line.startsWith('Input:')) {
        const parts = line.substring(6).split(':')
        const id = parseInt(parts[0], 10)
        const filePath = parts.slice(1).join(':')
        fileMap[id] = filePath
        if (!files.includes(filePath)) files.push(filePath)
      }
      if (line.startsWith('{')) {
        currentPage = parseInt(line.substring(1), 10)
      }
      if (line.startsWith('h') || line.startsWith('x')) {
        const match = line.match(/^[hx](\d+),(\d+),(-?\d+):(-?\d+),(-?\d+),(-?\d+),(-?\d+),(-?\d+)/)
        if (match) {
          const fileId = parseInt(match[1], 10)
          const lineNum = parseInt(match[2], 10)
          const x = parseInt(match[4], 10)
          const y = parseInt(match[5], 10)
          const width = parseInt(match[6], 10)
          const height = parseInt(match[7], 10)
          if (fileMap[fileId] && lineNum > 0) {
            entries.push({ page: currentPage, x, y, width, height, file: fileMap[fileId], line: lineNum })
          }
        }
      }
    }
    return { entries, files }
  }

  forwardSearch(data: SynctexData, file: string, line: number): ForwardResult | null {
    const match = data.entries.find(e => e.file === file && e.line === line)
    if (!match) return null
    return { page: match.page, x: match.x, y: match.y }
  }

  inverseSearch(data: SynctexData, page: number, x: number, y: number): InverseResult | null {
    const pageEntries = data.entries.filter(e => e.page === page)
    if (pageEntries.length === 0) return null
    let closest: SynctexEntry | null = null
    let minDist = Infinity
    for (const entry of pageEntries) {
      const dist = Math.abs(entry.y - y) + Math.abs(entry.x - x) * 0.1
      if (dist < minDist) {
        minDist = dist
        closest = entry
      }
    }
    if (!closest) return null
    return { file: closest.file, line: closest.line }
  }
}
