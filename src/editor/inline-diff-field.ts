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
