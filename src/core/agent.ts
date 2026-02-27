import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk"
import { createOpencodeServer } from "@opencode-ai/sdk/server"

export interface MessagePart {
  id: string
  type: "text" | "reasoning" | "tool" | "file" | "step-start" | "step-finish" | "patch" | "subtask" | "retry" | "compaction"
  text?: string
  tool?: string
  callID?: string
  toolState?: ToolState
  cost?: number
  tokens?: { input: number; output: number; reasoning?: number; cache?: { read: number; write: number } }
  reason?: string
  files?: string[]
  error?: string
  attempt?: number
  prompt?: string
  description?: string
  auto?: boolean
}

export type ToolStatus = "pending" | "running" | "completed" | "error"

export interface ToolState {
  status: ToolStatus
  input?: unknown
  output?: string
  title?: string
  error?: string
  metadata?: Record<string, unknown>
  time?: { start?: number; end?: number }
  attachments?: { path?: string; filename?: string }[]
}

export interface AgentMessage {
  id: string
  role: "user" | "assistant"
  parts: MessagePart[]
  timestamp: number
}

export interface AgentSession {
  id: string
  title?: string
  createdAt: number
}

export interface Permission {
  id: string
  sessionID: string
  title: string
  permission: string
  metadata: Record<string, unknown>
}

export interface QuestionOption {
  label: string
  description?: string
}

export interface QuestionItem {
  header?: string
  question: string
  multiple?: boolean
  options: QuestionOption[]
}

export interface QuestionRequest {
  id: string
  sessionID: string
  questions: QuestionItem[]
 }

export interface ModelInfo {
  id: string
  providerID: string
  name: string
  status?: string
}

export interface ProviderInfo {
  id: string
  name: string
  models: Record<string, ModelInfo>
  connected: boolean
}

export interface SlashCommand {
  name: string
  description?: string
}

export interface AgentEvent {
  type: string
  properties: Record<string, unknown>
}

type EventHandler = (event: AgentEvent) => void

export class AgentClient {
  private client: OpencodeClient
  private baseUrl: string | null = null
  private eventHandlers: Set<EventHandler> = new Set()
  private streaming = false
  private serverHandle: { url: string; close(): void } | null = null
  private serverReady: Promise<void>

  constructor(baseUrl?: string) {
    if (baseUrl) {
      this.baseUrl = baseUrl
      this.client = createOpencodeClient({ baseUrl })
      this.serverReady = Promise.resolve()
    } else {
      this.client = null as unknown as OpencodeClient
      this.serverReady = this.startServer()
    }
  }

  private async startServer(): Promise<void> {
    try {
      this.serverHandle = await createOpencodeServer({
        hostname: "127.0.0.1",
        port: 4096,
        timeout: 15000,
      })
      this.baseUrl = this.serverHandle.url
      this.client = createOpencodeClient({ baseUrl: this.serverHandle.url })
    } catch (err) {
      console.error("Failed to start opencode server:", err)
      this.baseUrl = "http://127.0.0.1:4096"
      this.client = createOpencodeClient({ baseUrl: this.baseUrl })
    }
  }

  private async ensureReady(): Promise<void> {
    await this.serverReady
  }

  shutdown(): void {
    this.stopEventStream()
    this.serverHandle?.close()
    this.serverHandle = null
  }

  async listSessions(): Promise<AgentSession[]> {
    try {
      await this.ensureReady()
      const response = await this.client.session.list()
      return this.mapSessionList(response.data)
    } catch {
      return []
    }
  }

  async getSession(id: string): Promise<AgentSession | null> {
    try {
      await this.ensureReady()
      const response = await this.client.session.get({ path: { id } })
      return this.mapSessionInfo(response.data)
    } catch {
      return null
    }
  }

  async getSessionMessages(id: string): Promise<AgentMessage[]> {
    try {
      await this.ensureReady()
      const response = await this.client.session.messages({ path: { id } })
      return this.mapMessages(response.data)
    } catch {
      return []
    }
  }

  async createSession(): Promise<AgentSession | null> {
    try {
      await this.ensureReady()
      const response = await this.client.session.create()
      if (response.error) {
        throw new Error(`session.create failed: ${JSON.stringify(response.error)}`)
      }
      return this.mapSessionInfo(response.data)
    } catch (err) {
      console.error("createSession error:", err)
      return null
    }
  }

  async deleteSession(id: string): Promise<void> {
    try {
      await this.ensureReady()
      await this.client.session.delete({ path: { id } })
    } catch {}
  }

  async sendMessage(sessionId: string, content: string, model?: { providerID: string; modelID: string }): Promise<void> {
    await this.ensureReady()
    const result = await this.client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text", text: content }],
        ...(model ? { model } : {}),
      },
    })
    if (result.error) {
      throw new Error(`prompt failed: ${JSON.stringify(result.error)}`)
    }
  }

  async sendMessageAsync(sessionId: string, content: string, model?: { providerID: string; modelID: string }): Promise<void> {
    await this.ensureReady()
    const result = await this.client.session.promptAsync({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text", text: content }],
        ...(model ? { model } : {}),
      },
    })
    if (result.error) {
      throw new Error(`promptAsync failed: ${JSON.stringify(result.error)}`)
    }
  }

  async cancelGeneration(sessionId: string): Promise<void> {
    try {
      await this.ensureReady()
      await this.client.session.abort({ path: { id: sessionId } })
    } catch {}
  }

  async summarizeSession(sessionId: string): Promise<void> {
    try {
      await this.ensureReady()
      await this.client.session.summarize({ path: { id: sessionId } })
    } catch {}
  }

  async getSessionDiff(sessionId: string): Promise<string | null> {
    try {
      await this.ensureReady()
      const response = await this.client.session.diff({ path: { id: sessionId } })
      return response.data as unknown as string
    } catch {
      return null
    }
  }

  async replyPermission(sessionId: string, permissionId: string, response: "once" | "always" | "reject"): Promise<void> {
    try {
      await this.ensureReady()
      await this.client.postSessionIdPermissionsPermissionId({
        path: { id: sessionId, permissionID: permissionId },
        body: { response },
      })
    } catch {}
  }

  async replyQuestion(questionId: string, answers: string[][]): Promise<void> {
    await this.ensureReady()
    const clientAny = this.client as any

    if (clientAny.question?.reply) {
      const result = await clientAny.question.reply({ requestID: questionId, answers })
      if (result?.error) {
        throw new Error(`question.reply failed: ${JSON.stringify(result.error)}`)
      }
      return
    }

    await this.postQuestionFallback(questionId, "reply", { answers })
  }

  async rejectQuestion(questionId: string): Promise<void> {
    await this.ensureReady()
    const clientAny = this.client as any

    if (clientAny.question?.reject) {
      const result = await clientAny.question.reject({ requestID: questionId })
      if (result?.error) {
        throw new Error(`question.reject failed: ${JSON.stringify(result.error)}`)
      }
      return
    }

    await this.postQuestionFallback(questionId, "reject")
  }

  private async postQuestionFallback(
    questionId: string,
    action: "reply" | "reject",
    body?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.baseUrl) {
      throw new Error("Agent server URL is not available")
    }

    const url = `${this.baseUrl}/question/${encodeURIComponent(questionId)}/${action}`
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      let detail = ""
      try {
        detail = await response.text()
      } catch {}
      throw new Error(`question.${action} fallback failed (${response.status})${detail ? `: ${detail}` : ""}`)
    }
  }

  async listProviders(): Promise<ProviderInfo[]> {
    try {
      await this.ensureReady()
      const response = await this.client.provider.list()
      return this.mapProviders(response.data)
    } catch {
      return []
    }
  }

  async listCommands(): Promise<SlashCommand[]> {
    try {
      await this.ensureReady()
      const response = await this.client.command.list()
      return this.mapCommands(response.data)
    } catch {
      return []
    }
  }

  async runCommand(sessionId: string, command: string): Promise<void> {
    try {
      await this.ensureReady()
      await this.client.session.command({
        path: { id: sessionId },
        body: { command, arguments: "" },
      })
    } catch {}
  }

  async getProviderAuthMethods(): Promise<Record<string, Array<{ type: string; label: string }>>> {
    try {
      await this.ensureReady()
      const response = await this.client.provider.auth()
      const data = response.data
      if (!data || typeof data !== "object") return {}
      return data as Record<string, Array<{ type: string; label: string }>>
    } catch {
      return {}
    }
  }

  async startOAuth(providerId: string, methodIndex = 0): Promise<{ url: string; method: string; instructions: string } | null> {
    try {
      await this.ensureReady()
      const response = await this.client.provider.oauth.authorize({
        path: { id: providerId },
        body: { method: methodIndex },
      })
      const data = response.data as Record<string, unknown> | undefined
      if (!data) return null
      return {
        url: String(data.url ?? ""),
        method: String(data.method ?? "auto"),
        instructions: String(data.instructions ?? ""),
      }
    } catch {
      return null
    }
  }

  async completeOAuth(providerId: string, methodIndex = 0, code?: string): Promise<boolean> {
    try {
      await this.ensureReady()
      await this.client.provider.oauth.callback({
        path: { id: providerId },
        body: { method: methodIndex, code },
      })
      return true
    } catch {
      return false
    }
  }

  async startEventStream(): Promise<void> {
    if (this.streaming) return
    this.streaming = true

    try {
      await this.ensureReady()
      const result = await this.client.global.event()

      for (const handler of this.eventHandlers) {
        try {
          handler({ type: "__connected", properties: {} })
        } catch {}
      }

      for await (const event of result.stream) {
        const raw = event as Record<string, unknown>
        const payload = (raw.payload ?? raw) as Record<string, unknown>
        const agentEvent: AgentEvent = {
          type: (payload.type as string) ?? "unknown",
          properties: (payload.properties as Record<string, unknown>) ?? payload,
        }

        this.logEvent(agentEvent)

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

  private logEvent(event: AgentEvent): void {
    try {
      const fs = require("fs")
      const summary: Record<string, unknown> = { type: event.type }
      const p = event.properties
      if (p.sessionID) summary.sessionID = p.sessionID
      if (p.status) summary.status = p.status
      if (p.part) {
        const part = p.part as Record<string, unknown>
        summary.partType = part.type
        summary.partId = part.id
        summary.messageID = part.messageID
        summary.sessionID = part.sessionID
      }
      if (p.info) {
        const info = p.info as Record<string, unknown>
        summary.msgId = info.id
        summary.role = info.role
        summary.infoSessionID = info.sessionID
      }
      if (p.error) summary.error = p.error
      fs.appendFileSync("/tmp/custodian-events.log",
        `${new Date().toISOString()} ${JSON.stringify(summary)}\n`)
    } catch {}
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
      .map((s) => this.mapSessionInfo(s)!)
      .filter(Boolean)
  }

  private mapSessionInfo(response: unknown): AgentSession | null {
    if (!response) return null
    const r = response as Record<string, unknown>
    return {
      id: String(r.id ?? r.sessionID ?? ""),
      title: r.title as string | undefined,
      createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now(),
    }
  }

  private mapMessages(raw: unknown): AgentMessage[] {
    if (!raw || !Array.isArray(raw)) return []
    return (raw as Array<Record<string, unknown>>).map((m) => ({
      id: String(m.id ?? ""),
      role: (m.role as "user" | "assistant") ?? "assistant",
      parts: this.mapParts(m.parts),
      timestamp: typeof m.time === "object" && m.time
        ? ((m.time as Record<string, unknown>).created as number ?? Date.now())
        : Date.now(),
    }))
  }

  mapParts(raw: unknown): MessagePart[] {
    if (!raw || !Array.isArray(raw)) return []
    return (raw as Array<Record<string, unknown>>).map((p) => this.mapPart(p))
  }

  mapPart(p: Record<string, unknown>): MessagePart {
    const type = (p.type as string) ?? "text"
    const base: MessagePart = {
      id: String(p.id ?? p.partID ?? `${type}-${Date.now()}-${Math.random()}`),
      type: type as MessagePart["type"],
    }

    switch (type) {
      case "text":
        base.text = String(p.text ?? "")
        break
      case "reasoning":
        base.text = String(p.text ?? "")
        break
      case "tool": {
        base.tool = String(p.tool ?? "")
        base.callID = String(p.callID ?? "")
        const state = p.state as Record<string, unknown> | undefined
        if (state) {
          base.toolState = {
            status: (state.status as ToolStatus) ?? "pending",
            input: state.input,
            output: state.output as string | undefined,
            title: state.title as string | undefined,
            error: state.error as string | undefined,
            metadata: state.metadata as Record<string, unknown> | undefined,
            time: state.time as { start?: number; end?: number } | undefined,
            attachments: this.mapAttachments(state.attachments),
          }
        }
        break
      }
      case "file":
        base.text = String(p.filename ?? p.url ?? "")
        break
      case "step-start":
        break
      case "step-finish":
        base.reason = p.reason as string | undefined
        base.cost = p.cost as number | undefined
        base.tokens = p.tokens as MessagePart["tokens"]
        break
      case "patch":
        base.files = p.files as string[] | undefined
        break
      case "subtask":
        base.prompt = p.prompt as string | undefined
        base.description = p.description as string | undefined
        break
      case "retry":
        base.attempt = p.attempt as number | undefined
        base.error = typeof p.error === "object" && p.error
          ? String((p.error as Record<string, unknown>).message ?? p.error)
          : String(p.error ?? "")
        break
      case "compaction":
        base.auto = p.auto as boolean | undefined
        break
    }

    return base
  }

  private mapAttachments(raw: unknown): { path?: string; filename?: string }[] | undefined {
    if (!raw || !Array.isArray(raw)) return undefined
    return (raw as Array<Record<string, unknown>>).map((a) => ({
      path: a.path as string | undefined,
      filename: a.filename as string | undefined,
    }))
  }

  private mapProviders(raw: unknown): ProviderInfo[] {
    if (!raw || typeof raw !== "object") return []
    const data = raw as Record<string, unknown>
    const connectedList = Array.isArray(data.connected) ? (data.connected as string[]) : []
    const connectedSet = new Set(connectedList)
    const all = (data.all ?? data) as unknown
    if (Array.isArray(all)) {
      return all.map((p: Record<string, unknown>) => {
        const id = String(p.id ?? "")
        return {
          id,
          name: String(p.name ?? id),
          models: this.mapModels(p.models, id),
          connected: connectedSet.has(id),
        }
      })
    }
    const entries = Object.entries(raw as Record<string, Record<string, unknown>>)
    return entries.map(([id, p]) => ({
      id,
      name: String(p.name ?? id),
      models: this.mapModels(p.models, id),
      connected: connectedSet.has(id),
    }))
  }

  private mapModels(raw: unknown, providerID: string): Record<string, ModelInfo> {
    if (!raw || typeof raw !== "object") return {}
    const result: Record<string, ModelInfo> = {}
    for (const [id, m] of Object.entries(raw as Record<string, Record<string, unknown>>)) {
      result[id] = {
        id,
        providerID,
        name: String((m as Record<string, unknown>).name ?? id),
        status: (m as Record<string, unknown>).status as string | undefined,
      }
    }
    return result
  }

  private mapCommands(raw: unknown): SlashCommand[] {
    if (!raw || !Array.isArray(raw)) return []
    return (raw as Array<Record<string, unknown>>).map((c) => ({
      name: String(c.name ?? ""),
      description: c.description as string | undefined,
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
