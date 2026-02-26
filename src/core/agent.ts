import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk"

export interface AgentMessage {
  id: string
  role: "user" | "assistant"
  content: string
  toolCalls?: ToolCall[]
  timestamp: number
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  output?: string
  approved?: boolean
}

export interface AgentSession {
  id: string
  title?: string
  createdAt: number
  messages: AgentMessage[]
}

export interface AgentEvent {
  type: string
  data: unknown
}

type EventHandler = (event: AgentEvent) => void

export class AgentClient {
  private client: OpencodeClient
  private eventHandlers: Set<EventHandler> = new Set()
  private streaming = false

  constructor(baseUrl = "http://localhost:4096") {
    this.client = createOpencodeClient({ baseUrl })
  }

  async listSessions(): Promise<AgentSession[]> {
    try {
      const response = await this.client.session.list()
      return this.mapSessionList(response.data)
    } catch (err) {
      console.error("Failed to list sessions:", err)
      return []
    }
  }

  async getSession(id: string): Promise<AgentSession | null> {
    try {
      const response = await this.client.session.get({ path: { id } })
      return this.mapSession(response.data)
    } catch {
      return null
    }
  }

  async getSessionMessages(id: string): Promise<AgentMessage[]> {
    try {
      const response = await this.client.session.messages({ path: { id } })
      return this.mapMessages(response.data)
    } catch {
      return []
    }
  }

  async getSessionDiff(id: string): Promise<string | null> {
    try {
      const response = await this.client.session.diff({ path: { id } })
      return response.data as unknown as string
    } catch {
      return null
    }
  }

  async createSession(): Promise<AgentSession | null> {
    try {
      const response = await this.client.session.create()
      return this.mapSession(response.data)
    } catch (err) {
      console.error("Failed to create session:", err)
      return null
    }
  }

  async sendMessage(sessionId: string, content: string): Promise<void> {
    try {
      await this.client.session.prompt({
        path: { id: sessionId },
        body: { parts: [{ type: "text", text: content }] },
      })
    } catch (err) {
      console.error("Failed to send message:", err)
      throw err
    }
  }

  async cancelGeneration(sessionId: string): Promise<void> {
    try {
      await this.client.session.abort({ path: { id: sessionId } })
    } catch (err) {
      console.error("Failed to cancel generation:", err)
    }
  }

  async startEventStream(): Promise<void> {
    if (this.streaming) return
    this.streaming = true

    try {
      const stream = await this.client.global.event()

      for await (const event of stream as AsyncIterable<unknown>) {
        const agentEvent: AgentEvent = {
          type: (event as Record<string, unknown>).type as string ?? "unknown",
          data: event,
        }

        for (const handler of this.eventHandlers) {
          try {
            handler(agentEvent)
          } catch {}
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Event stream error:", err)
      }
    } finally {
      this.streaming = false
    }
  }

  stopEventStream(): void {
    this.streaming = false
  }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler)
    return () => this.eventHandlers.delete(handler)
  }

  private mapSessionList(response: unknown): AgentSession[] {
    if (!response || !Array.isArray(response)) return []
    return (response as Array<Record<string, unknown>>)
      .map((s) => this.mapSession(s)!)
      .filter(Boolean)
  }

  private mapSession(response: unknown): AgentSession | null {
    if (!response) return null
    const r = response as Record<string, unknown>
    return {
      id: String(r.id ?? r.sessionID ?? ""),
      title: r.title as string | undefined,
      createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now(),
      messages: this.mapMessages(r.messages),
    }
  }

  private mapMessages(raw: unknown): AgentMessage[] {
    if (!raw || !Array.isArray(raw)) return []
    return (raw as Array<Record<string, unknown>>).map((m) => ({
      id: String(m.id ?? ""),
      role: (m.role as "user" | "assistant") ?? "assistant",
      content: String(m.content ?? m.text ?? ""),
      timestamp: typeof m.timestamp === "number" ? m.timestamp : Date.now(),
      toolCalls: this.mapToolCalls(m.toolCalls ?? m.tool_calls),
    }))
  }

  private mapToolCalls(raw: unknown): ToolCall[] | undefined {
    if (!raw || !Array.isArray(raw)) return undefined
    return (raw as Array<Record<string, unknown>>).map((tc) => ({
      id: String(tc.id ?? ""),
      name: String(tc.name ?? tc.type ?? ""),
      input: (tc.input ?? tc.arguments ?? {}) as Record<string, unknown>,
      output: tc.output as string | undefined,
      approved: tc.approved as boolean | undefined,
    }))
  }
}

let _defaultClient: AgentClient | null = null

export function getAgentClient(baseUrl?: string): AgentClient {
  if (!_defaultClient) {
    _defaultClient = new AgentClient(baseUrl)
  }
  return _defaultClient
}
