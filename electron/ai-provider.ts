import type { BrowserWindow } from 'electron'
import { spawn, execFileSync, type ChildProcess } from 'child_process'

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiRequest {
  providers: string[]
  systemPrompt: string
  context: string
  selectedText: string
  userPrompt: string
  models: Record<string, string>
  providerModes?: Record<string, 'api' | 'cli'>
  history?: ConversationMessage[]
}

export interface AiMessages {
  system: string
  user: string
}

// Check if a CLI command exists
function whichCmd(cmd: string): string | null {
  try {
    return execFileSync('which', [cmd], { encoding: 'utf-8' }).trim() || null
  } catch {
    return null
  }
}

// Map provider ID → CLI command name
const CLI_MAP: Record<string, string> = {
  claude: 'claude',
  openai: 'codex',
  gemini: 'gemini',
}

export class AiProviderManager {
  private abortControllers: Map<string, AbortController> = new Map()
  private childProcesses: Map<string, ChildProcess> = new Map()

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

  /** Build an OpenAI-style messages array including conversation history. */
  private buildApiMessages(request: AiRequest): Array<{ role: 'user' | 'assistant'; content: string }> {
    const history = request.history ?? []
    const currentUser = this.buildMessages(request).user
    return [
      ...history,
      { role: 'user' as const, content: currentUser },
    ]
  }

  /** Build a flat prompt string for CLI mode, prepending history turns. */
  private buildCliPrompt(request: AiRequest): string {
    const messages = this.buildMessages(request)
    const history = request.history ?? []
    const historyText = history
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')
    const base = `${messages.system}\n\n${historyText ? historyText + '\n\n' : ''}${messages.user}`
    return base
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

    const modes = request.providerModes || {}

    const promises = request.providers.map((providerId) => {
      const controller = new AbortController()
      this.abortControllers.set(providerId, controller)

      const model = request.models[providerId]
      const mode = modes[providerId] || 'api'

      // If mode is CLI, go directly to CLI (skip API key check)
      if (mode === 'cli' && CLI_MAP[providerId]) {
        return this.streamViaCli(providerId, CLI_MAP[providerId], messages, window, controller, request)
      }

      if (providerId === 'claude') {
        return this.streamClaude(providerId, messages, model, keys['claude'], window, controller, request)
      } else if (providerId === 'openai') {
        return this.streamOpenAI(providerId, messages, model, keys['openai'], window, controller, request)
      } else if (providerId === 'gemini') {
        return this.streamGemini(providerId, messages, model, keys['gemini'], window, controller, request)
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
    for (const proc of this.childProcesses.values()) {
      proc.kill()
    }
    this.childProcesses.clear()
  }

  private async streamViaCli(
    providerId: string,
    cliName: string,
    messages: AiMessages,
    window: BrowserWindow,
    controller: AbortController,
    request?: AiRequest,
  ): Promise<void> {
    return new Promise((resolve) => {
      const fullPrompt = request ? this.buildCliPrompt(request) : `${messages.system}\n\n${messages.user}`

      // Find the actual CLI path to avoid shell alias issues
      const cliPath = whichCmd(cliName)
      if (!cliPath) {
        window.webContents.send('ai:stream', {
          provider: providerId, type: 'error',
          error: `CLI not found: ${cliName}`,
        })
        resolve()
        return
      }

      let args: string[]
      if (cliName === 'claude') {
        args = ['-p', '-', '--output-format', 'text']
      } else if (cliName === 'codex') {
        // OpenAI's Codex CLI: codex exec "prompt" (reads from stdin with -)
        args = ['exec', '-']
      } else if (cliName === 'gemini') {
        args = ['-p', '-']
      } else {
        window.webContents.send('ai:stream', {
          provider: providerId, type: 'error',
          error: `Unknown CLI: ${cliName}`,
        })
        resolve()
        return
      }

      // Use shell: true to inherit full PATH from user's shell profile
      // This is needed because Electron GUI apps on macOS don't get .zshrc PATH
      const proc = spawn(cliPath, args, {
        shell: true,
        env: { ...process.env, TERM: 'dumb' },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Write prompt to stdin and close
      proc.stdin?.write(fullPrompt)
      proc.stdin?.end()
      this.childProcesses.set(providerId, proc)

      controller.signal.addEventListener('abort', () => {
        proc.kill()
      })

      proc.stdout?.on('data', (data: Buffer) => {
        if (controller.signal.aborted) return
        window.webContents.send('ai:stream', {
          provider: providerId,
          type: 'delta',
          text: data.toString(),
        })
      })

      // Accumulate stderr for error reporting on non-zero exit
      let stderrOutput = ''
      proc.stderr?.on('data', (data: Buffer) => {
        stderrOutput += data.toString()
      })

      proc.on('close', (code) => {
        this.childProcesses.delete(providerId)
        if (!controller.signal.aborted) {
          if (code !== 0) {
            // Show accumulated stderr or generic message
            const errorMsg = stderrOutput.trim()
              ? stderrOutput.trim().slice(-500)
              : `CLI exited with code ${code}`
            window.webContents.send('ai:stream', {
              provider: providerId, type: 'error',
              error: errorMsg,
            })
          } else {
            window.webContents.send('ai:stream', { provider: providerId, type: 'done' })
          }
        }
        resolve()
      })

      proc.on('error', (err) => {
        this.childProcesses.delete(providerId)
        window.webContents.send('ai:stream', {
          provider: providerId, type: 'error', error: err.message,
        })
        resolve()
      })
    })
  }

  private async streamClaude(
    providerId: string,
    messages: AiMessages,
    model: string | undefined,
    apiKey: string | undefined,
    window: BrowserWindow,
    controller: AbortController,
    request?: AiRequest,
  ): Promise<void> {
    try {
      if (!apiKey) {
        // Fallback to CLI
        const cliPath = whichCmd('claude')
        if (cliPath) {
          return this.streamViaCli(providerId, 'claude', messages, window, controller, request)
        }
        throw new Error('No API key for Claude and claude CLI not found')
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Anthropic = require('@anthropic-ai/sdk').default ?? require('@anthropic-ai/sdk').Anthropic
      const client = new Anthropic({ apiKey })

      const apiMessages = request ? this.buildApiMessages(request) : [{ role: 'user' as const, content: messages.user }]

      const stream = client.messages.stream(
        {
          model: model ?? 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: messages.system,
          messages: apiMessages,
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
    request?: AiRequest,
  ): Promise<void> {
    try {
      if (!apiKey) throw new Error('No API key for OpenAI. Install openai CLI or set OPENAI_API_KEY.')

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const OpenAI = require('openai').default ?? require('openai').OpenAI
      const client = new OpenAI({ apiKey })

      const apiMessages = request ? this.buildApiMessages(request) : [{ role: 'user' as const, content: messages.user }]

      const stream = await client.chat.completions.create(
        {
          model: model ?? 'gpt-4o',
          stream: true,
          messages: [
            { role: 'system' as const, content: messages.system },
            ...apiMessages,
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
    request?: AiRequest,
  ): Promise<void> {
    try {
      if (!apiKey) {
        const cliPath = whichCmd('gemini')
        if (cliPath) {
          return this.streamViaCli(providerId, 'gemini', messages, window, controller, request)
        }
        throw new Error('No API key for Gemini and gemini CLI not found')
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { GoogleGenerativeAI } = require('@google/generative-ai')
      const genAI = new GoogleGenerativeAI(apiKey)
      const genModel = genAI.getGenerativeModel({
        model: model ?? 'gemini-2.0-flash',
        systemInstruction: messages.system,
      })

      // Build Gemini-style contents array including history
      const history = request?.history ?? []
      const geminiContents = [
        ...history.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        { role: 'user', parts: [{ text: messages.user }] },
      ]

      const result = await genModel.generateContentStream(
        { contents: geminiContents },
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
