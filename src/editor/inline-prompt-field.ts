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
