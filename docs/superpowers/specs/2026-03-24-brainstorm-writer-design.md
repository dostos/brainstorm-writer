# Brainstorm Writer — Design Spec

An Electron-based tool for editing academic papers paragraph by paragraph with multi-AI agent assistance. Users open a LaTeX project, view the compiled PDF, select text, and receive simultaneous improvement suggestions from multiple AI providers (Claude, GPT, Gemini) for side-by-side comparison.

## Architecture

### Process Model

Two-process Electron architecture with IPC bridge:

**Main Process** handles:
- File system access (open/save LaTeX projects, watch for changes)
- SyncTeX parsing (bidirectional PDF coordinate ↔ LaTeX file:line mapping)
- AI provider API calls (concurrent requests to multiple providers, streaming responses)
- Settings storage (API keys encrypted via safeStorage, default prompts, preferences)
- Environment variable fallback for API keys

**Renderer Process** handles:
- Panel layout management (dockview)
- Four core panels: File Tree, LaTeX Editor, PDF Viewer, AI Panel
- State management (zustand)
- IPC communication with Main Process via contextBridge

```
Main Process
├── file-manager.ts        — File I/O, project open/save, file watching
├── synctex-parser.ts      — Parse .synctex.gz, bidirectional coordinate mapping
├── ai-provider.ts         — Multi-provider API manager, concurrent requests, streaming
└── settings (electron-store + safeStorage)

IPC Bridge (contextBridge / preload.ts)

Renderer Process (React)
├── App.tsx                — dockview layout setup
├── panels/
│   ├── FileTree.tsx       — Directory tree (react-arborist)
│   ├── Editor.tsx         — CodeMirror 6 LaTeX editor
│   ├── PdfViewer.tsx      — pdf.js viewer with SyncTeX integration
│   └── AiPanel.tsx        — Prompt input, provider selection, results display
├── stores/
│   ├── editor-store.ts    — Selection state, cursor position, active file
│   ├── ai-store.ts        — Request/response state, streaming progress
│   └── settings-store.ts  — Settings mirror from main process
└── components/
    ├── DiffView.tsx       — Inline diff display (original vs. AI suggestion)
    ├── ProviderBadge.tsx   — AI provider indicator
    └── PromptInput.tsx     — Prompt textarea + saved prompts dropdown
```

## Panel Layout

Default 3-column layout using dockview. All panels are draggable, splittable, and rearrangeable.

```
┌──────────┬────────────────────────┬──────────────┐
│          │      LaTeX Editor      │              │
│  File    │  (CodeMirror 6, tabs)  │   AI Panel   │
│  Tree    ├────────────────────────┤  - selected  │
│          │     PDF Viewer         │    text      │
│  react-  │  (pdf.js + SyncTeX)   │  - prompt    │
│  arborist│                        │  - results   │
│          │                        │    per agent │
└──────────┴────────────────────────┴──────────────┘
```

## Core Data Flows

### Paragraph Editing Flow

1. User selects text in PDF viewer
2. SyncTeX maps PDF coordinates to LaTeX source file:line
3. Editor jumps to and highlights the corresponding text
4. Selected text appears in AI Panel
5. User types a prompt (or picks a saved prompt) and selects providers
6. Main Process sends concurrent API requests to all selected providers
7. Context sent with each request: system prompt + paper metadata + section text + selected text + user prompt
8. Streaming responses render in real-time in per-provider result cards
9. User clicks "Apply" to replace editor selection, or "Diff" to view inline comparison

### SyncTeX Integration

- LaTeX compilation produces `.synctex.gz`
- Main Process parses it into a bidirectional mapping table
- **Inverse search** (SyncTeX terminology): PDF click/selection → editor file:line (used when selecting text in PDF)
- **Forward search** (SyncTeX terminology): editor cursor position → PDF page:coordinates (used for preview sync)
- Parsed via synctex-js or custom parser for the gzipped format

### AI Context Assembly

Each API request is composed of:

```
System prompt (from default settings)
+ Paper metadata (title, authors, abstract — extracted from main .tex)
+ Context scope (selected text only / current section / full paper — user configurable)
+ Selected text (the target for modification)
+ User prompt (free-text instruction)
```

Formatted per provider's API conventions (messages array for Claude/OpenAI, generateContent for Gemini).

## Technology Stack

| Area | Library | Purpose |
|------|---------|---------|
| Framework | Electron + React + TypeScript | Application shell |
| Build | Vite + electron-builder | Dev server, bundling, packaging |
| Panel system | dockview | Drag/drop panel layout |
| Editor | CodeMirror 6 | LaTeX text editing |
| LaTeX support | @codemirror/lang-latex + custom snippets | Syntax highlighting, autocomplete, snippets |
| PDF | pdfjs-dist | PDF rendering |
| SyncTeX | synctex-js or custom parser | PDF ↔ LaTeX mapping |
| File tree | react-arborist | Directory tree UI |
| AI — Claude | @anthropic-ai/sdk | Claude API |
| AI — OpenAI | openai | GPT API |
| AI — Gemini | @google/generative-ai | Gemini API |
| Settings | electron-store | Persistent config storage |
| Diff | diff (npm) + CodeMirror merge extension | Inline diff display |
| State | zustand | Lightweight state management |

## Settings & Prompt Management

### API Key Management

- **Settings UI**: Per-provider API key input fields in a Settings panel
- **Environment variable fallback**: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`
- **Priority**: Settings UI value > environment variable
- **Storage**: electron-store with Electron's safeStorage API for encryption

### Default Prompt Configuration

Three levels of prompt customization:

1. **System prompt**: Always included in every request. Configurable in Settings. Default: general academic writing assistant persona.
2. **Context template**: Controls how paper metadata is formatted in the request. Supports `{{title}}`, `{{section}}`, `{{authors}}` placeholders.
3. **Saved prompts**: User-defined frequently used prompts (e.g., "Make more concise", "Add citations", "Improve academic tone"). Accessible via dropdown in the AI Panel.

### Context Scope Control

User-adjustable per request:
- **Selected text only** — minimal tokens, fast response
- **Current section** — section-level context for coherent suggestions
- **Full paper** — maximum context (higher token cost)

## IPC API Surface

Key IPC channels between Main and Renderer:

```typescript
// File operations
'file:open-project' → opens folder picker, returns file tree
'file:read'         → reads file content
'file:write'        → saves file content
'file:watch'        → watches for external changes (including compiled PDF for auto-reload)

// SyncTeX
'synctex:parse'     → parses .synctex.gz for current project
'synctex:forward'   → PDF coords → LaTeX file:line
'synctex:inverse'   → LaTeX file:line → PDF page:coords

// AI
'ai:request'        → sends prompt to specified providers, returns streaming channel
'ai:stream'         → streaming response chunks per provider
'ai:cancel'         → cancels in-flight requests

// Settings
'settings:get'      → reads settings
'settings:set'      → writes settings
'settings:get-keys' → reads API keys (decrypted)
```

## Model Selection

Each AI provider supports selecting a specific model (e.g., `claude-sonnet-4-20250514` vs `claude-opus-4-20250514`, `gpt-4o` vs `gpt-4o-mini`). The Settings panel exposes a model dropdown per provider populated from a hardcoded list. Users can also type a custom model ID.

## Error Handling (AI Requests)

- **Rate limits / network errors**: Show error inline in the provider's result card with a "Retry" button. Other providers' results are unaffected.
- **Partial stream failure**: Display whatever was received with an error indicator. User can retry or dismiss.
- **Timeout**: 60-second default timeout per request, configurable in settings.

## Out of Scope (v1)

- LaTeX compilation (user compiles externally; tool watches for PDF changes)
- Git integration
- Collaborative editing
- Bibliography management
- Image/figure editing
