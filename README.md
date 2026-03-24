# Brainstorm Writer

An Electron-based academic paper editing tool with multi-AI agent assistance. Edit LaTeX papers paragraph by paragraph with simultaneous suggestions from multiple AI providers.

## Features

- **Dockable Panel Layout** — VS Code-style draggable/resizable panels (dockview)
- **LaTeX Editor** — CodeMirror 6 with syntax highlighting, tabs, word wrap toggle, Cmd+S save
- **PDF Viewer** — pdf.js with continuous scroll, auto-fit width, HiDPI rendering, text selection
- **Multi-AI Comparison** — Send selected text to Claude, GPT, and Gemini simultaneously
- **API + CLI Modes** — Use API keys or fall back to installed CLI tools (`claude`, `gemini`)
- **Structured Feedback** — AI responses in 3 sections: Revised text, Comments, Suggestions
- **PDF-to-Source Navigation** — Double-click PDF text to jump to the matching `.tex` file and line
- **SyncTeX Support** — Bidirectional PDF-LaTeX coordinate mapping
- **Settings Panel** — Per-provider mode (API/CLI), model selection, system prompt, saved prompts
- **Persistent State** — Remembers last project, window size/position, and all settings

## Quick Start

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Run tests
npm test              # Unit tests (vitest)
npm run test:e2e      # E2E tests (playwright)

# Build
npm run build
```

## Requirements

- Node.js 18+
- For CLI mode: `claude` and/or `gemini` CLI tools installed
- For API mode: Set API keys via Settings panel or environment variables:
  - `ANTHROPIC_API_KEY`
  - `OPENAI_API_KEY`
  - `GOOGLE_API_KEY`

## Usage

1. **Open Project** — Click "Open Project" in the Explorer panel to open a LaTeX project folder
2. **View PDF** — The viewer auto-detects PDFs in the project root and `output/` subdirectories
3. **Select Text** — Drag to select text in the PDF or LaTeX editor
4. **Get AI Feedback** — Type an instruction (or pick a saved prompt) and click "Send to All"
5. **Apply Changes** — Click "Apply" on any AI result to replace the selected text, or "Diff" to compare

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+S | Save current file |
| Cmd+Enter | Send prompt to AI |
| Space+Drag | Pan PDF viewer |
| Ctrl+Scroll | Zoom PDF |
| Shift+Scroll | Horizontal scroll PDF |

## Architecture

```
Electron Main Process
├── file-manager      — File I/O, project scanning, file watching
├── synctex-parser    — PDF ↔ LaTeX bidirectional mapping
├── ai-provider       — Multi-provider API/CLI streaming
└── settings-manager  — Encrypted API keys, preferences

Renderer (React)
├── dockview layout   — 4 draggable panels
├── FileTree          — react-arborist file explorer
├── Editor            — CodeMirror 6 LaTeX editor
├── PdfViewer         — pdf.js with text layer
├── AiPanel           — Prompt input, streaming results, diff view
└── SettingsPanel     — Provider config, prompts, preferences
```

## Tech Stack

Electron, React, TypeScript, Vite, dockview, CodeMirror 6, pdf.js, zustand, react-arborist, @anthropic-ai/sdk, openai, @google/generative-ai, electron-store, Playwright

## License

MIT
