import { test as base, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright-core'
import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'

// Create a test LaTeX project fixture
function createTestProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-e2e-'))
  fs.writeFileSync(
    path.join(dir, 'main.tex'),
    `\\documentclass{article}
\\title{Test Paper on Language Models}
\\author{Test Author}
\\begin{document}
\\maketitle
\\section{Introduction}
The rapid advancement of large language models has fundamentally transformed how researchers approach natural language processing tasks. This paper explores the implications of these developments.

\\section{Methods}
We conducted a comprehensive survey of recent literature on transformer-based architectures and their applications in academic writing assistance.

\\section{Results}
Our findings suggest that AI-assisted writing tools can significantly improve the quality and efficiency of academic paper composition.

\\end{document}
`,
  )
  return dir
}

type TestFixtures = {
  electronApp: ElectronApplication
  window: Page
  testProjectDir: string
}

export const test = base.extend<TestFixtures>({
  testProjectDir: async ({}, use) => {
    const dir = createTestProject()
    await use(dir)
    fs.rmSync(dir, { recursive: true, force: true })
  },

  electronApp: async ({}, use) => {
    // Build first
    const mainPath = path.join(__dirname, '..', 'dist-electron', 'main.js')
    if (!fs.existsSync(mainPath)) {
      throw new Error('Build first: npm run build')
    }

    const app = await electron.launch({
      args: ['--disable-gpu', '--enable-logging', mainPath],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      },
    })

    await use(app)
    await app.close()
  },

  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()
    // Wait for app to be ready
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(1000)
    await use(window)
  },
})

export { expect } from '@playwright/test'
