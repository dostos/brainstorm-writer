# Brainstorm Writer — Improvement Roadmap

Consolidated findings from 4 parallel review agents: UX Researcher, Academic User (PhD), Security Engineer, Performance Engineer.

## CRITICAL / Must-Fix

| # | Item | Source | Effort |
|---|------|--------|--------|
| 1 | **Retry button not implemented** — click handler is empty | UX, Academic | Trivial |
| 2 | **EditorState destroyed on tab switch** — undo history, scroll position, cursor all lost | UX, Academic, Perf | Low |
| 3 | **SyncTeX never auto-parsed** — PDF loads but never calls `parseSynctex`, so inverse search always falls back to slow text search | UX, Academic | Low |
| 4 | **No unsaved-change indicator** — no dirty dot on tabs, no close confirmation, silent data loss | UX, Academic | Low |
| 5 | **API keys sent to renderer in plaintext** — `getApiKeys` IPC returns decrypted keys to renderer where they sit in React state. Should never leave main process | Security | Medium |
| 6 | **Unrestricted file read/write** — no path validation on `file:read`, `file:write`. Renderer can access any file on disk | Security | Medium |

## HIGH Priority

| # | Item | Source | Effort |
|---|------|--------|--------|
| 7 | **Find/Replace (Cmd+F)** — `@codemirror/search` installed but not wired up | Academic | Trivial |
| 8 | **LaTeX build button** — spawn `latexmk -pdf -synctex=1`, stream log, auto-reload PDF | Academic, UX | Medium |
| 9 | **PDF virtualized rendering** — all pages rendered eagerly in continuous mode (~18MB/page at 2x DPR). Use IntersectionObserver to render only visible pages | Performance | Medium |
| 10 | **AI streaming causes excessive re-renders** — full `results` object spread per token, 60 re-renders/sec with 3 providers. Batch updates or per-provider memoized components | Performance | Medium |
| 11 | **Parse structured AI response** — system prompt outputs `=== REVISED ===` / `=== COMMENTS ===` / `=== SUGGESTIONS ===` but rendered as raw text. Parse into collapsible sections, Apply only on REVISED | Academic, UX | Low |
| 12 | **PDF search logic should be in main process** — currently 15 sequential IPC round-trips to find PDF. Move to single `findAndReadPdf` IPC call | Performance | Low |
| 13 | **No Content Security Policy** — XSS in renderer has full access to electronAPI | Security | Low |
| 14 | **`\cite{}` and `\ref{}` autocomplete** — scan `.bib` and `.tex` files for keys, register CodeMirror CompletionSource | Academic | Medium |

## MEDIUM Priority

| # | Item | Source | Effort |
|---|------|--------|--------|
| 15 | AI conversation thread (multi-turn follow-up) | Academic | Medium |
| 16 | Allow sending prompts without text selection (free-form question mode) | UX, Academic | Low |
| 17 | File tree context menu (new file, rename, delete) | Academic | Medium |
| 18 | Forward SyncTeX (editor cursor → PDF position, Cmd+click) | Academic | Low |
| 19 | Debounce `fs.watch` callbacks (burst events during LaTeX compile) | Performance | Low |
| 20 | Preserve PDF scroll position on reload | UX, Perf | Low |
| 21 | Call `pdfDoc.destroy()` before loading new PDF — memory leak | Performance | Low |
| 22 | Debounce API key input saves (currently 50 IPC calls per key entry) | UX | Low |
| 23 | Save confirmation feedback (transient "Saved" badge) | UX | Low |
| 24 | Replace `execSync('which ' + cmd)` with `execFileSync('which', [cmd])` — shell injection risk | Security | Trivial |
| 25 | `settings:set` IPC should validate schema, not accept arbitrary object | Security | Low |
| 26 | Atomic file writes (write to .tmp then rename) — prevent partial writes on crash | Security, UX | Low |
| 27 | Close tab should clear stale selection in editor store | UX | Trivial |
| 28 | Space+drag panning only works when focus is on body, not inside editor/inputs | UX | Low |
| 29 | "Send to All" button label should reflect actual provider count | UX | Trivial |
| 30 | Provider badges need hover effect / tooltip to indicate toggleability | UX | Trivial |
| 31 | Add copy-to-clipboard button on AI results | UX | Low |

## LOW / Nice-to-Have

| # | Item | Source | Effort |
|---|------|--------|--------|
| 32 | Code splitting (separate chunks for pdfjs, codemirror, dockview) | Performance | Low |
| 33 | Environment snippets (`\begin{equation}` etc.) | Academic | Low |
| 34 | Math hover preview (KaTeX) | Academic | Medium |
| 35 | Git diff gutter in editor | Academic | Medium |
| 36 | Autosave (30-second interval to temp file) | UX | Low |
| 37 | Project name in header bar | UX | Trivial |
| 38 | AI panel focus shortcut (Cmd+Shift+A) | UX | Trivial |
| 39 | DiffView: useMemo + diffChars for short text | Performance | Trivial |
| 40 | Cache SDK clients per apiKey (avoid re-instantiation per request) | Performance | Low |
| 41 | Cache `whichCmd` results (avoid execSync on every CLI request) | Performance | Trivial |
| 42 | Lazy-load pdfjs-dist (dynamic import) | Performance | Low |
| 43 | LRU cap on editor file content cache | Performance | Low |
| 44 | Store AI streaming chunks as array, join for display (reduce GC pressure) | Performance | Low |
| 45 | Add `sandbox: true`, explicit `webSecurity: true`, navigation guards | Security | Low |
| 46 | Prompt history (up-arrow in prompt textarea) | UX | Low |
| 47 | "Apply partial" — select subset of AI result to apply | Academic | Medium |
| 48 | Track changes / comment system (sidecar JSON) | Academic | High |
| 49 | Global project-wide text search (Cmd+Shift+F) | Academic | Medium |
| 50 | OpenAI CLI mode shows "N/A" — should warn or disable | UX | Trivial |
