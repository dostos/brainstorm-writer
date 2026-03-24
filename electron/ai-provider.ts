import type { BrowserWindow } from 'electron'

export interface AiRequest {
  providers: string[]
  systemPrompt: string
  context: string
  selectedText: string
  userPrompt: string
  models: Record<string, string>
}

export interface AiMessages {
  system: string
  user: string
}

export class AiProviderManager {
  private abortControllers: Map<string, AbortController> = new Map()

  buildMessages(request: AiRequest): AiMessages {
    const userParts: string[] = []

    if (request.context) {
      userParts.push(`Context:\n${request.context}`)
    }

    if (request.selectedText) {
      userParts.push(`Selected text:\n${request.selectedText}`)
    }

    if (request.userPrompt) {
      userParts.push(`Instruction:\n${request.userPrompt}`)
    }

    return {
      system: request.systemPrompt,
      user: userParts.join('\n\n'),
    }
  }

  getProviderIds(providers: string[]): string[] {
    return providers
  }

  async sendToAll(
    request: AiRequest,
    keys: Record<string, string | undefined>,
    window: BrowserWindow,
  ): Promise<void> {
    const messages = this.buildMessages(request)

    const promises = request.providers.map((providerId) => {
      const controller = new AbortController()
      this.abortControllers.set(providerId, controller)

      const model = request.models[providerId]

      if (providerId === 'claude') {
        return this.streamClaude(providerId, messages, model, keys['claude'], window, controller)
      } else if (providerId === 'openai') {
        return this.streamOpenAI(providerId, messages, model, keys['openai'], window, controller)
      } else if (providerId === 'gemini') {
        return this.streamGemini(providerId, messages, model, keys['gemini'], window, controller)
      } else {
        window.webContents.send('ai:stream', {
          provider: providerId,
          type: 'error',
          error: `Unknown provider: ${providerId}`,
        })
        return Promise.resolve()
      }
    })

    await Promise.allSettled(promises)
    this.abortControllers.clear()
  }

  cancelAll(): void {
    for (const controller of this.abortControllers.values()) {
      controller.abort()
    }
    this.abortControllers.clear()
  }

  private async streamClaude(
    providerId: string,
    messages: AiMessages,
    model: string | undefined,
    apiKey: string | undefined,
    window: BrowserWindow,
    controller: AbortController,
  ): Promise<void> {
    try {
      if (!apiKey) throw new Error('No API key for Claude')

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Anthropic = require('@anthropic-ai/sdk').default ?? require('@anthropic-ai/sdk').Anthropic
      const client = new Anthropic({ apiKey })

      const stream = client.messages.stream(
        {
          model: model ?? 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: messages.system,
          messages: [{ role: 'user', content: messages.user }],
        },
        { signal: controller.signal },
      )

      for await (const event of stream) {
        if (controller.signal.aborted) break

        if (
          event.type === 'content_block_delta' &&
          event.delta?.type === 'text_delta'
        ) {
          window.webContents.send('ai:stream', {
            provider: providerId,
            type: 'delta',
            text: event.delta.text,
          })
        }
      }

      if (!controller.signal.aborted) {
        window.webContents.send('ai:stream', { provider: providerId, type: 'done' })
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return
      const message = err instanceof Error ? err.message : String(err)
      window.webContents.send('ai:stream', { provider: providerId, type: 'error', error: message })
    }
  }

  private async streamOpenAI(
    providerId: string,
    messages: AiMessages,
    model: string | undefined,
    apiKey: string | undefined,
    window: BrowserWindow,
    controller: AbortController,
  ): Promise<void> {
    try {
      if (!apiKey) throw new Error('No API key for OpenAI')

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const OpenAI = require('openai').default ?? require('openai').OpenAI
      const client = new OpenAI({ apiKey })

      const stream = await client.chat.completions.create(
        {
          model: model ?? 'gpt-4o',
          stream: true,
          messages: [
            { role: 'system', content: messages.system },
            { role: 'user', content: messages.user },
          ],
        },
        { signal: controller.signal },
      )

      for await (const chunk of stream) {
        if (controller.signal.aborted) break
        const text = chunk.choices[0]?.delta?.content ?? ''
        if (text) {
          window.webContents.send('ai:stream', { provider: providerId, type: 'delta', text })
        }
      }

      if (!controller.signal.aborted) {
        window.webContents.send('ai:stream', { provider: providerId, type: 'done' })
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return
      const message = err instanceof Error ? err.message : String(err)
      window.webContents.send('ai:stream', { provider: providerId, type: 'error', error: message })
    }
  }

  private async streamGemini(
    providerId: string,
    messages: AiMessages,
    model: string | undefined,
    apiKey: string | undefined,
    window: BrowserWindow,
    controller: AbortController,
  ): Promise<void> {
    try {
      if (!apiKey) throw new Error('No API key for Gemini')

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { GoogleGenerativeAI } = require('@google/generative-ai')
      const genAI = new GoogleGenerativeAI(apiKey)
      const genModel = genAI.getGenerativeModel({
        model: model ?? 'gemini-2.0-flash',
        systemInstruction: messages.system,
      })

      const result = await genModel.generateContentStream(
        { contents: [{ role: 'user', parts: [{ text: messages.user }] }] },
        { signal: controller.signal },
      )

      for await (const chunk of result.stream) {
        if (controller.signal.aborted) break
        const text: string = chunk.text()
        if (text) {
          window.webContents.send('ai:stream', { provider: providerId, type: 'delta', text })
        }
      }

      if (!controller.signal.aborted) {
        window.webContents.send('ai:stream', { provider: providerId, type: 'done' })
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return
      const message = err instanceof Error ? err.message : String(err)
      window.webContents.send('ai:stream', { provider: providerId, type: 'error', error: message })
    }
  }
}
