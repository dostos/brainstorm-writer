# Inline AI Editor Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move AI interaction from a separate panel into the editor — inline diff preview with accept/reject, and a prompt input bar embedded in the editor tab.

**Architecture:** When the user selects text and triggers AI (via inline prompt bar or keyboard shortcut), the AI response replaces the selection with a CodeMirror inline diff decoration showing original vs. suggested text. The user can accept (keep changes) or reject (revert). The separate AI panel remains for conversation/comparison, but the primary workflow is now editor-native.

**Tech Stack:** CodeMirror 6 Decoration API (StateField, Decoration.widget, Decoration.replace), `diff` package for change computation, zustand for state coordination.

---

## File Structure

```
src/
├── components/
│   ├── InlineDiff.tsx          — React widget for inline accept/reject UI
│   └── InlinePromptBar.tsx     — Prompt input bar that appears above selection in editor
├── editor/
│   ├── inline-diff-field.ts    — CodeMirror StateField managing inline diff decorations
│   └── inline-prompt-field.ts  — CodeMirror StateField for the prompt bar widget
├── stores/
│   └── editor-store.ts         — Add: pendingInlineDiff, inlinePrompt state
├── panels/
│   ├── Editor.tsx              — Integrate new fields into extensions
│   └── AiPanel.tsx             — "Show in Editor" button alongside existing Apply
```

---

### Task 1: Inline Diff State & Store

**Files:**
- Modify: `src/stores/editor-store.ts`

Add state for managing inline diffs in the editor.

- [ ] **Step 1: Add inline diff state to editor store**

Add to `src/stores/editor-store.ts`:
```typescript
// New state fields
pendingInlineDiff: {
  file: string
  from: number
  to: number
  original: string
  suggested: string
  comments: string   // AI's explanation of why it made these changes
  provider: string
} | null

// New actions
showInlineDiff: (diff: { file: string; from: number; to: number; original: string; suggested: string; comments: string; provider: string }) => void
acceptInlineDiff: () => void
rejectInlineDiff: () => void
```

Implementation:
```typescript
pendingInlineDiff: null,
showInlineDiff: (diff) => set({ pendingInlineDiff: diff }),
acceptInlineDiff: () => set((state) => {
  // The actual text replacement is handled by the Editor component
  return { pendingInlineDiff: null }
}),
rejectInlineDiff: () => set({ pendingInlineDiff: null }),
```

- [ ] **Step 2: Verify store compiles**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/stores/editor-store.ts
git commit -m "feat: add inline diff state to editor store"
```

---

### Task 2: InlineDiff React Widget

**Files:**
- Create: `src/components/InlineDiff.tsx`

A small React component rendered as a CodeMirror widget decoration. Shows the diff inline with accept/reject buttons.

- [ ] **Step 1: Create InlineDiff component**

`src/components/InlineDiff.tsx`:
```tsx
import React from 'react'
import { diffWords } from 'diff'

interface InlineDiffProps {
  original: string
  suggested: string
  comments: string    // AI's explanation of changes
  provider: string
  onAccept: () => void
  onReject: () => void
}

export function InlineDiff({ original, suggested, comments, provider, onAccept, onReject }: InlineDiffProps) {
  const changes = diffWords(original, suggested)

  return (
    <div style={{
      background: '#1a2a1a',
      border: '1px solid #2a4a2a',
      borderRadius: 4,
      margin: '4px 0',
      fontSize: 13,
      lineHeight: 1.6,
      fontFamily: 'inherit',
      display: 'flex',
    }}>
      {/* Left: Diff content */}
      <div style={{ flex: 1, padding: '8px 12px', borderRight: comments ? '1px solid #2a4a2a' : 'none' }}>
        {/* Header with buttons */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 6, fontSize: 11, color: '#888',
        }}>
          <span>Suggested by <strong style={{ color: '#6c9' }}>{provider}</strong></span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={onAccept} style={{
              background: '#4a4', color: '#fff', border: 'none',
              padding: '2px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
            }}>Accept (Tab)</button>
            <button onClick={onReject} style={{
              background: '#444', color: '#ccc', border: 'none',
              padding: '2px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
            }}>Reject (Esc)</button>
          </div>
        </div>

        {/* Diff */}
        <div style={{ whiteSpace: 'pre-wrap' }}>
          {changes.map((change, i) => (
            <span key={i} style={{
              background: change.added ? 'rgba(80,200,120,0.2)' : change.removed ? 'rgba(200,80,80,0.15)' : 'transparent',
              textDecoration: change.removed ? 'line-through' : 'none',
              color: change.added ? '#6c9' : change.removed ? '#c66' : '#ccc',
            }}>{change.value}</span>
          ))}
        </div>
      </div>

      {/* Right: AI comments — why it made these changes */}
      {comments && (
        <div style={{
          width: 220, padding: '8px 10px', fontSize: 11, color: '#aaa',
          lineHeight: 1.5, overflow: 'auto', background: '#1a1a2a',
          borderRadius: '0 4px 4px 0',
        }}>
          <div style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 }}>
            Comments
          </div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{comments}</div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/InlineDiff.tsx
git commit -m "feat: InlineDiff React component with accept/reject buttons"
```

---

### Task 3: CodeMirror Inline Diff Decoration

**Files:**
- Create: `src/editor/inline-diff-field.ts`

A CodeMirror StateField that renders the InlineDiff widget as a decoration when `pendingInlineDiff` is set.

- [ ] **Step 1: Create the StateField**

`src/editor/inline-diff-field.ts`:
```typescript
import { StateField, StateEffect } from '@codemirror/state'
import { EditorView, Decoration, DecorationSet, WidgetType } from '@codemirror/view'
import { createRoot, Root } from 'react-dom/client'
import React from 'react'
import { InlineDiff } from '../components/InlineDiff'

// Effects to trigger inline diff show/hide
export const showInlineDiffEffect = StateEffect.define<{
  from: number
  to: number
  original: string
  suggested: string
  comments: string
  provider: string
}>()

export const clearInlineDiffEffect = StateEffect.define<void>()

class InlineDiffWidget extends WidgetType {
  private root: Root | null = null

  constructor(
    private original: string,
    private suggested: string,
    private comments: string,
    private provider: string,
    private onAccept: () => void,
    private onReject: () => void,
  ) {
    super()
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div')
    container.style.padding = '0'
    this.root = createRoot(container)
    this.root.render(
      React.createElement(InlineDiff, {
        original: this.original,
        suggested: this.suggested,
        comments: this.comments,
        provider: this.provider,
        onAccept: this.onAccept,
        onReject: this.onReject,
      })
    )
    return container
  }

  destroy() {
    // Defer unmount to avoid React warnings
    if (this.root) {
      const r = this.root
      setTimeout(() => r.unmount(), 0)
    }
  }

  ignoreEvent() { return true }
}

// StateField that manages the inline diff decoration
export function createInlineDiffField(
  onAccept: () => void,
  onReject: () => void,
) {
  return StateField.define<DecorationSet>({
    create() {
      return Decoration.none
    },
    update(decorations, tr) {
      // Check for show/clear effects
      for (const effect of tr.effects) {
        if (effect.is(showInlineDiffEffect)) {
          const { from, to, original, suggested, comments, provider } = effect.value
          const widget = new InlineDiffWidget(original, suggested, comments, provider, onAccept, onReject)
          // Place the widget after the selection
          return Decoration.set([
            // Highlight the original text with a subtle background
            Decoration.mark({ class: 'cm-inline-diff-original' }).range(from, to),
            // Widget below the selection showing the diff
            Decoration.widget({ widget, block: true }).range(to),
          ])
        }
        if (effect.is(clearInlineDiffEffect)) {
          return Decoration.none
        }
      }
      // Map decorations through document changes
      return decorations.map(tr.changes)
    },
    provide: (field) => EditorView.decorations.from(field),
  })
}
```

- [ ] **Step 2: Add CSS for the highlight**

Append to `src/styles/global.css`:
```css
/* Inline diff original text highlight */
.cm-inline-diff-original {
  background: rgba(200, 150, 80, 0.15);
  border-bottom: 1px dashed rgba(200, 150, 80, 0.4);
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/editor/inline-diff-field.ts src/styles/global.css
git commit -m "feat: CodeMirror StateField for inline diff decorations"
```

---

### Task 4: Inline Prompt Bar

**Files:**
- Create: `src/components/InlinePromptBar.tsx`

A small prompt input that appears above the selected text in the editor. Triggered by a keyboard shortcut (Cmd+K).

- [ ] **Step 1: Create InlinePromptBar component**

`src/components/InlinePromptBar.tsx`:
```tsx
import React, { useState, useRef, useEffect } from 'react'
import { useSettingsStore } from '../stores/settings-store'

interface InlinePromptBarProps {
  selectedText: string
  onSubmit: (prompt: string) => void
  onCancel: () => void
}

export function InlinePromptBar({ selectedText, onSubmit, onCancel }: InlinePromptBarProps) {
  const [prompt, setPrompt] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { savedPrompts } = useSettingsStore()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (prompt.trim()) onSubmit(prompt.trim())
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div style={{
      background: '#252540',
      border: '1px solid #3a3a5e',
      borderRadius: 6,
      padding: '6px 8px',
      margin: '4px 0',
      display: 'flex',
      gap: 6,
      alignItems: 'center',
    }}>
      <span style={{ color: '#6c9', fontSize: 12, flexShrink: 0 }}>AI:</span>
      {savedPrompts.length > 0 && (
        <select
          onChange={(e) => { if (e.target.value) setPrompt(e.target.value) }}
          value=""
          style={{
            background: '#1e1e2e', color: '#ccc', border: '1px solid #444',
            borderRadius: 3, padding: '2px 4px', fontSize: 11, flexShrink: 0,
          }}
        >
          <option value="">Quick...</option>
          {savedPrompts.map((p) => <option key={p} value={p}>{p.slice(0, 30)}</option>)}
        </select>
      )}
      <input
        ref={inputRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type instruction... (Enter to send, Esc to cancel)"
        style={{
          flex: 1,
          background: '#1e1e2e',
          color: '#ccc',
          border: '1px solid #444',
          borderRadius: 3,
          padding: '4px 8px',
          fontSize: 12,
          outline: 'none',
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Create CodeMirror widget field for the prompt bar**

`src/editor/inline-prompt-field.ts`:
```typescript
import { StateField, StateEffect } from '@codemirror/state'
import { EditorView, Decoration, DecorationSet, WidgetType } from '@codemirror/view'
import { createRoot, Root } from 'react-dom/client'
import React from 'react'
import { InlinePromptBar } from '../components/InlinePromptBar'

export const showPromptBarEffect = StateEffect.define<{
  pos: number
  selectedText: string
}>()
export const hidePromptBarEffect = StateEffect.define<void>()

class PromptBarWidget extends WidgetType {
  private root: Root | null = null

  constructor(
    private selectedText: string,
    private onSubmit: (prompt: string) => void,
    private onCancel: () => void,
  ) {
    super()
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div')
    this.root = createRoot(container)
    this.root.render(
      React.createElement(InlinePromptBar, {
        selectedText: this.selectedText,
        onSubmit: this.onSubmit,
        onCancel: this.onCancel,
      })
    )
    return container
  }

  destroy() {
    if (this.root) {
      const r = this.root
      setTimeout(() => r.unmount(), 0)
    }
  }

  ignoreEvent() { return true }
}

export function createInlinePromptField(
  onSubmit: (prompt: string, selectedText: string) => void,
  onCancel: () => void,
) {
  return StateField.define<DecorationSet>({
    create() { return Decoration.none },
    update(deco, tr) {
      for (const effect of tr.effects) {
        if (effect.is(showPromptBarEffect)) {
          const { pos, selectedText } = effect.value
          const widget = new PromptBarWidget(
            selectedText,
            (prompt) => onSubmit(prompt, selectedText),
            onCancel,
          )
          return Decoration.set([
            Decoration.widget({ widget, block: true }).range(pos),
          ])
        }
        if (effect.is(hidePromptBarEffect)) {
          return Decoration.none
        }
      }
      return deco.map(tr.changes)
    },
    provide: (field) => EditorView.decorations.from(field),
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/InlinePromptBar.tsx src/editor/inline-prompt-field.ts
git commit -m "feat: inline prompt bar component and CodeMirror field"
```

---

### Task 5: Integrate into Editor

**Files:**
- Modify: `src/panels/Editor.tsx`

Wire up Cmd+K to show the inline prompt bar, handle AI requests, and show inline diff.

- [ ] **Step 1: Add extensions to buildExtensions**

In `src/panels/Editor.tsx`, add to the `buildExtensions()` function:

```typescript
import { createInlineDiffField, showInlineDiffEffect, clearInlineDiffEffect } from '../editor/inline-diff-field'
import { createInlinePromptField, showPromptBarEffect, hidePromptBarEffect } from '../editor/inline-prompt-field'
import { keymap } from '@codemirror/view'

// Inside buildExtensions():
// 1. Inline diff field
createInlineDiffField(
  () => {
    // Accept: apply the suggested text
    const diff = useEditorStore.getState().pendingInlineDiff
    if (diff && editorViewRef.current) {
      editorViewRef.current.dispatch({
        changes: { from: diff.from, to: diff.to, insert: diff.suggested },
        effects: clearInlineDiffEffect.of(undefined),
      })
      useEditorStore.getState().acceptInlineDiff()
    }
  },
  () => {
    // Reject: just clear the decoration
    if (editorViewRef.current) {
      editorViewRef.current.dispatch({
        effects: clearInlineDiffEffect.of(undefined),
      })
    }
    useEditorStore.getState().rejectInlineDiff()
  },
),

// 2. Inline prompt field
createInlinePromptField(
  async (prompt, selectedText) => {
    // Hide prompt bar
    editorViewRef.current?.dispatch({ effects: hidePromptBarEffect.of(undefined) })
    // Send AI request for inline edit
    const settings = useSettingsStore.getState()
    const sel = useEditorStore.getState().selection
    if (!sel) return
    // Use first selected provider only for inline mode
    const provider = useAiStore.getState().selectedProviders[0] || 'claude'
    useAiStore.getState().startRequest([provider])
    // ... (wire to AI request, on response show inline diff)
  },
  () => {
    // Cancel: hide prompt bar
    editorViewRef.current?.dispatch({ effects: hidePromptBarEffect.of(undefined) })
  },
),

// 3. Keyboard shortcut: Cmd+K to show inline prompt
keymap.of([{
  key: 'Mod-k',
  run: (view) => {
    const sel = view.state.selection.main
    if (sel.from === sel.to) return false // no selection
    const text = view.state.doc.sliceString(sel.from, sel.to)
    view.dispatch({
      effects: showPromptBarEffect.of({ pos: sel.from, selectedText: text }),
    })
    return true
  },
}]),
```

- [ ] **Step 2: Watch for AI response and show inline diff**

Add a useEffect that watches for completed AI results when in inline mode:

```typescript
// When AI finishes in inline mode, show the diff in the editor
useEffect(() => {
  const diff = useEditorStore.getState().pendingInlineDiff
  // pendingInlineDiff is set by the inline prompt handler after AI responds
  if (diff && editorViewRef.current) {
    editorViewRef.current.dispatch({
      effects: showInlineDiffEffect.of({
        from: diff.from,
        to: diff.to,
        original: diff.original,
        suggested: diff.suggested,
        provider: diff.provider,
      }),
    })
  }
}, [useEditorStore.getState().pendingInlineDiff])
```

- [ ] **Step 3: Add Tab/Esc keybindings for accept/reject**

```typescript
keymap.of([
  {
    key: 'Tab',
    run: () => {
      const diff = useEditorStore.getState().pendingInlineDiff
      if (!diff) return false
      // Accept the diff
      useEditorStore.getState().acceptInlineDiff()
      return true
    },
  },
  {
    key: 'Escape',
    run: () => {
      const diff = useEditorStore.getState().pendingInlineDiff
      if (!diff) return false
      useEditorStore.getState().rejectInlineDiff()
      return true
    },
  },
]),
```

- [ ] **Step 4: Verify full flow works**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/panels/Editor.tsx
git commit -m "feat: integrate inline AI prompt and diff into editor (Cmd+K)"
```

---

### Task 6: "Show in Editor" Button in AI Panel

**Files:**
- Modify: `src/panels/AiPanel.tsx`

Add a "Show in Editor" button alongside existing Apply/Diff buttons that sends the result to the inline diff view.

- [ ] **Step 1: Add "Edit" button to result actions**

In AiPanel.tsx, in the result action buttons section, add:

```tsx
<button
  onClick={() => {
    const sel = lastSelectionRef.current
    if (!sel || sel.from < 0) return // PDF selection, can't inline
    const text = parsed.revised || result.text
    useEditorStore.getState().showInlineDiff({
      file: useEditorStore.getState().activeFile || '',
      from: sel.from,
      to: sel.to,
      original: sel.text,
      suggested: stripCodeFences(text),
      comments: parsed.comments || '',
      provider: result.provider,
    })
  }}
  style={{
    background: '#3a3a5e', color: '#ccc', border: 'none',
    padding: '2px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
  }}
>
  Edit
</button>
```

- [ ] **Step 2: Verify it compiles and works**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/panels/AiPanel.tsx
git commit -m "feat: 'Edit' button in AI panel shows inline diff in editor"
```

---

### Task 7: Full Integration Wiring

**Files:**
- Modify: `src/panels/Editor.tsx` — wire AI request from inline prompt to response to inline diff
- Modify: `src/stores/editor-store.ts` — watch pendingInlineDiff for editor effects

The inline prompt submits an AI request. When the response arrives, it needs to be displayed as an inline diff in the editor. This task wires the full loop.

- [ ] **Step 1: Create inline AI request handler**

In Editor.tsx, create a function that:
1. Takes the prompt + selected text
2. Sends a single-provider AI request via IPC
3. Listens for the streaming response
4. When done, calls `showInlineDiff` with the result
5. Dispatches the `showInlineDiffEffect` to CodeMirror

```typescript
const handleInlineAiRequest = useCallback(async (prompt: string, selectedText: string) => {
  const view = editorViewRef.current
  const file = useEditorStore.getState().activeFile
  if (!view || !file) return

  const sel = view.state.selection.main
  const settings = useSettingsStore.getState()
  const providers = useAiStore.getState().selectedProviders
  const provider = providers[0] || 'claude'

  // Read context based on scope
  let context = ''
  if (settings.contextScope === 'section') {
    context = view.state.doc.toString()
  }

  // Send request
  await window.electronAPI.aiRequest({
    providers: [provider],
    systemPrompt: settings.systemPrompt,
    context,
    selectedText,
    userPrompt: prompt,
    models: settings.models,
    providerModes: settings.providerModes,
  })

  // The response will arrive via onAiStream events
  // We watch the ai-store for the provider's result to finish
  const unsubscribe = useAiStore.subscribe((state) => {
    const result = state.results[provider]
    if (result?.done && !result.error) {
      unsubscribe()
      const parsed = parseAiResponse(result.text)
      const suggested = stripCodeFences(parsed.revised || result.text)
      const comments = parsed.comments || ''

      // Show inline diff with comments
      useEditorStore.getState().showInlineDiff({
        file, from: sel.from, to: sel.to,
        original: selectedText, suggested, comments, provider,
      })

      // Dispatch CodeMirror effect
      view.dispatch({
        effects: showInlineDiffEffect.of({
          from: sel.from, to: sel.to,
          original: selectedText, suggested, comments, provider,
        }),
      })
    }
  })
}, [])
```

- [ ] **Step 2: Wire the inline prompt onSubmit to this handler**

Update the `createInlinePromptField` call in `buildExtensions` to use `handleInlineAiRequest`.

- [ ] **Step 3: Wire accept to dispatch CodeMirror changes + clear**

Ensure that accepting the inline diff:
1. Replaces the text in CodeMirror via `dispatch({ changes })`
2. Clears the decoration via `clearInlineDiffEffect`
3. Clears the store via `acceptInlineDiff()`
4. Marks the file dirty

- [ ] **Step 4: End-to-end test**

1. Select text in editor
2. Press Cmd+K — prompt bar appears
3. Type "make more concise" → Enter
4. AI streams response
5. Inline diff appears below selection with green/red highlights
6. Press Tab to accept (text replaced) or Esc to reject (reverted)

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/panels/Editor.tsx src/stores/editor-store.ts
git commit -m "feat: full inline AI workflow — Cmd+K → prompt → diff → accept/reject"
```

---

### Task 8: Cleanup & Polish

**Files:**
- Modify: `src/panels/Editor.tsx` — remove debug logs
- Modify: `src/panels/AiPanel.tsx` — remove debug logs
- Modify: `electron/main.ts` — remove synctex debug logs

- [ ] **Step 1: Remove all console.log debug statements**

Search for `console.log('[` and remove all debug logging added during development.

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove debug logging, clean up"
```
