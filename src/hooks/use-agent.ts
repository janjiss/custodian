import { createSignal, createResource, createEffect, onMount, onCleanup } from "solid-js"
import {
  getAgentClient,
  type AgentSession,
  type AgentMessage,
  type AgentEvent,
  type MessagePart,
  type Permission,
  type QuestionRequest,
  type ModelInfo,
  type ProviderInfo,
  type SlashCommand,
} from "../core/agent"
import { formatDiffContextForAgent } from "../core/diff-context"
import {
  saveLastModel,
  loadLastModel,
  clearLastModel,
  saveLastSessionId,
  loadLastSessionId,
  clearLastSessionId,
} from "../core/config"

const BUILTIN_COMMANDS: SlashCommand[] = [
  { name: "sessions", description: "Open session picker" },
]

export function useAgent() {
  const client = getAgentClient()

  const [currentSessionId, setCurrentSessionId] = createSignal<string | null>(null)
  const [messages, setMessages] = createSignal<AgentMessage[]>([])
  const [isStreaming, setIsStreaming] = createSignal(false)
  const [connected, setConnected] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [pendingPermissions, setPendingPermissions] = createSignal<Permission[]>([])
  const [pendingQuestions, setPendingQuestions] = createSignal<QuestionRequest[]>([])
  const [pendingParts, setPendingParts] = createSignal<{ messageId: string; part: MessagePart }[]>([])
  const [selectedModel, setSelectedModel] = createSignal<{ providerID: string; modelID: string } | null>(loadLastModel())
  const [lastSessionId] = createSignal<string | null>(loadLastSessionId())

  const [sessions, { refetch: refreshSessions }] = createResource(async () => {
    try {
      return await client.listSessions()
    } catch {
      return [] as AgentSession[]
    }
  })

  const [providers, { refetch: refreshProviders }] = createResource(async () => {
    try {
      return await client.listProviders()
    } catch {
      return [] as ProviderInfo[]
    }
  })

  const [commands] = createResource(async () => {
    try {
      const remote = await client.listCommands()
      const merged = [...BUILTIN_COMMANDS]
      for (const cmd of remote) {
        if (!merged.some((existing) => existing.name === cmd.name)) merged.push(cmd)
      }
      return merged
    } catch {
      return BUILTIN_COMMANDS
    }
  })

  createEffect(() => {
    const list = sessions()
    if (!list || currentSessionId()) return
    if (list.length === 0) return

    const saved = lastSessionId()
    if (saved) {
      const match = list.find((session) => session.id === saved)
      if (match) {
        void switchSession(match.id)
        return
      }
      clearLastSessionId()
    }

    const latest = [...list].sort((a, b) => b.createdAt - a.createdAt)[0]
    if (latest) {
      void switchSession(latest.id)
    }
  })

  const upsertPart = (sessionId: string, messageId: string, part: MessagePart) => {
    if (sessionId !== currentSessionId()) return

    const current = messages()
    const msgIdx = current.findIndex((m) => m.id === messageId)

    if (msgIdx < 0) {
      setPendingParts((pp) => [...pp, { messageId, part }])
      return
    }

    setMessages((prev) => {
      const i = prev.findIndex((m) => m.id === messageId)
      if (i < 0) return prev

      const updated = [...prev]
      const msg = { ...updated[i], parts: [...updated[i].parts] }
      const partIdx = msg.parts.findIndex((p) => p.id === part.id)
      if (partIdx >= 0) {
        msg.parts[partIdx] = part
      } else {
        msg.parts.push(part)
      }
      updated[i] = msg
      return updated
    })
  }

  const applyDelta = (sessionId: string, messageId: string, partId: string, field: string, delta: string) => {
    if (sessionId !== currentSessionId()) return

    setMessages((prev) => {
      const msgIdx = prev.findIndex((m) => m.id === messageId)
      if (msgIdx < 0) return prev

      const updated = [...prev]
      const msg = { ...updated[msgIdx], parts: [...updated[msgIdx].parts] }
      const partIdx = msg.parts.findIndex((p) => p.id === partId)
      if (partIdx < 0) return prev

      const part = { ...msg.parts[partIdx] }
      if (field === "text" && typeof part.text === "string") {
        part.text += delta
      } else if (field === "text") {
        part.text = delta
      }
      msg.parts[partIdx] = part
      updated[msgIdx] = msg
      return updated
    })
  }

  const removePart = (sessionId: string, messageId: string, partId: string) => {
    if (sessionId !== currentSessionId()) return

    setMessages((prev) => {
      const msgIdx = prev.findIndex((m) => m.id === messageId)
      if (msgIdx < 0) return prev

      const updated = [...prev]
      const msg = { ...updated[msgIdx], parts: updated[msgIdx].parts.filter((p) => p.id !== partId) }
      updated[msgIdx] = msg
      return updated
    })
  }

  const handleEvent = (event: AgentEvent) => {
    const props = event.properties

    switch (event.type) {
      case "message.part.updated": {
        const rawPart = props.part as Record<string, unknown> | undefined
        if (!rawPart) return
        const sessionID = String(rawPart.sessionID ?? props.sessionID ?? "")
        const messageID = String(rawPart.messageID ?? props.messageID ?? "")
        const part = client.mapPart(rawPart)
        upsertPart(sessionID, messageID, part)
        break
      }

      case "message.part.removed": {
        const sessionID = String(props.sessionID ?? "")
        const messageID = String(props.messageID ?? "")
        const partID = String(props.partID ?? "")
        removePart(sessionID, messageID, partID)
        break
      }

      case "message.updated": {
        const info = (props.info ?? props) as Record<string, unknown>
        const sessionID = String(info.sessionID ?? props.sessionID ?? "")
        if (sessionID !== currentSessionId()) return
        const messageID = String(info.id ?? "")
        const role = (info.role as "user" | "assistant") ?? "assistant"

        // Collect any parts that arrived before this message.updated
        const buffered = pendingParts().filter((pp) => pp.messageId === messageID)
        if (buffered.length > 0) {
          setPendingParts((pp) => pp.filter((p) => p.messageId !== messageID))
        }

        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === messageID)
          if (idx >= 0) {
            const updated = [...prev]
            const existing = updated[idx]
            const mergedParts = [...existing.parts]
            for (const bp of buffered) {
              const pi = mergedParts.findIndex((p) => p.id === bp.part.id)
              if (pi >= 0) mergedParts[pi] = bp.part
              else mergedParts.push(bp.part)
            }
            updated[idx] = { ...existing, role, parts: mergedParts }
            return updated
          }

          // For user messages, replace the optimistic local message ID only;
          // don't merge server parts — they duplicate the optimistic content
          if (role === "user") {
            const optIdx = prev.findLastIndex((m) => m.id.startsWith("user-") && m.role === "user")
            if (optIdx >= 0) {
              const updated = [...prev]
              updated[optIdx] = { ...updated[optIdx], id: messageID }
              return updated
            }
          }

          return [...prev, {
            id: messageID,
            role,
            parts: buffered.map((bp) => bp.part),
            timestamp: Date.now(),
          }]
        })
        break
      }

      case "message.removed": {
        const sessionID = String(props.sessionID ?? "")
        if (sessionID !== currentSessionId()) return
        const messageID = String(props.messageID ?? "")
        setMessages((prev) => prev.filter((m) => m.id !== messageID))
        break
      }

      case "session.status": {
        const sessionID = String(props.sessionID ?? "")
        if (sessionID !== currentSessionId()) return
        const statusObj = props.status as Record<string, unknown> | string | undefined
        const statusType = typeof statusObj === "object" && statusObj
          ? String(statusObj.type ?? "")
          : String(statusObj ?? "")
        setIsStreaming(statusType === "busy" || statusType === "running")
        break
      }

      case "session.idle": {
        const sessionID = String(props.sessionID ?? "")
        if (sessionID !== currentSessionId()) return
        setIsStreaming(false)
        break
      }

      case "session.error": {
        const sessionID = String(props.sessionID ?? "")
        if (sessionID !== currentSessionId()) return
        const errObj = props.error as Record<string, unknown> | string | undefined
        const errMsg = typeof errObj === "object" && errObj
          ? String(errObj.message ?? errObj.type ?? "Session error")
          : String(errObj ?? "Session error")
        setError(errMsg)
        setIsStreaming(false)
        break
      }

      case "permission.updated": {
        const sessionID = String(props.sessionID ?? "")
        if (sessionID !== currentSessionId()) return
        const perm: Permission = {
          id: String(props.id ?? props.permissionID ?? ""),
          sessionID,
          title: String(props.title ?? ""),
          permission: String(props.type ?? props.permission ?? ""),
          metadata: (props.metadata as Record<string, unknown>) ?? {},
        }
        setPendingPermissions((prev) => {
          const idx = prev.findIndex((p) => p.id === perm.id)
          if (idx >= 0) {
            const updated = [...prev]
            updated[idx] = perm
            return updated
          }
          return [...prev, perm]
        })
        break
      }

      case "permission.replied": {
        const permID = String(props.permissionID ?? props.id ?? "")
        setPendingPermissions((prev) => prev.filter((p) => p.id !== permID))
        break
      }

      case "question.asked":
      case "question.updated": {
        const req = (props.request ?? props) as Record<string, unknown>
        const sessionID = String(req.sessionID ?? props.sessionID ?? "")
        if (sessionID !== currentSessionId()) return

        const questionsRaw = Array.isArray(req.questions) ? req.questions : []
        const questionReq: QuestionRequest = {
          id: String(req.id ?? req.requestID ?? ""),
          sessionID,
          questions: questionsRaw.map((q) => {
            const qq = q as Record<string, unknown>
            const options = Array.isArray(qq.options) ? qq.options : []
            return {
              header: qq.header ? String(qq.header) : undefined,
              question: String(qq.question ?? ""),
              multiple: Boolean(qq.multiple),
              options: options.map((o) => {
                const oo = o as Record<string, unknown>
                return {
                  label: String(oo.label ?? ""),
                  description: oo.description ? String(oo.description) : undefined,
                }
              }),
            }
          }),
        }

        setPendingQuestions((prev) => {
          const idx = prev.findIndex((q) => q.id === questionReq.id)
          if (idx >= 0) {
            const updated = [...prev]
            updated[idx] = questionReq
            return updated
          }
          return [...prev, questionReq]
        })
        break
      }

      case "question.replied": {
        const qid = String(props.requestID ?? props.id ?? "")
        setPendingQuestions((prev) => prev.filter((q) => q.id !== qid))
        break
      }

      case "session.created":
      case "session.updated":
      case "session.deleted":
        refreshSessions()
        break

      case "__connected":
        setConnected(true)
        setError(null)
        break
    }
  }

  onMount(() => {
    const unsubscribe = client.onEvent(handleEvent)

    client.startEventStream().catch((err) => {
      setConnected(false)
      setError(err instanceof Error ? err.message : String(err))
    })

    onCleanup(() => {
      unsubscribe()
      client.stopEventStream()
    })
  })

  const createSession = async (): Promise<string | null> => {
    try {
      const session = await client.createSession()
      if (!session) return null
      setCurrentSessionId(session.id)
      setMessages([])
      setPendingPermissions([])
      setPendingQuestions([])
      setPendingParts([])
      saveLastSessionId(session.id)
      refreshSessions()
      return session.id
    } catch {
      return null
    }
  }

  const switchSession = async (id: string) => {
    setCurrentSessionId(id)
    setPendingPermissions([])
    setPendingQuestions([])
    setPendingParts([])
    try {
      const msgs = await client.getSessionMessages(id)
      setMessages(msgs)
      saveLastSessionId(id)
    } catch {}
  }

  const sendMessage = async (content: string) => {
    let sid = currentSessionId()
    if (!sid) {
      sid = await createSession()
      if (!sid) {
        setError("Failed to create session")
        return
      }
    }

    const diffCtx = formatDiffContextForAgent()
    const fullContent = diffCtx ? `${diffCtx}\n\n${content}` : content

    const userMsg: AgentMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      parts: [{ id: `text-${Date.now()}`, type: "text", text: content }],
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      setIsStreaming(true)
      setError(null)
      await client.sendMessageAsync(sid, fullContent, selectedModel() ?? undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setIsStreaming(false)
    }
  }

  const cancel = async () => {
    const sid = currentSessionId()
    if (sid) {
      await client.cancelGeneration(sid)
    }
    // Clear local blockers immediately so input becomes usable right away.
    setIsStreaming(false)
    setPendingPermissions([])
    setPendingQuestions([])
  }

  const compact = async () => {
    const sid = currentSessionId()
    if (sid) {
      await client.summarizeSession(sid)
    }
  }

  const replyPermission = async (permissionId: string, response: "once" | "always" | "reject") => {
    const sid = currentSessionId()
    if (sid) {
      await client.replyPermission(sid, permissionId, response)
      setPendingPermissions((prev) => prev.filter((p) => p.id !== permissionId))
    }
  }

  const runCommand = async (command: string) => {
    const sid = currentSessionId()
    if (!sid) return
    await client.runCommand(sid, command)
  }

  const replyQuestion = async (questionId: string, answers: string[][]) => {
    try {
      await client.replyQuestion(questionId, answers)
      setPendingQuestions((prev) => prev.filter((q) => q.id !== questionId))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const rejectQuestion = async (questionId: string) => {
    try {
      await client.rejectQuestion(questionId)
      setPendingQuestions((prev) => prev.filter((q) => q.id !== questionId))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const selectModel = (providerID: string, modelID: string) => {
    setSelectedModel({ providerID, modelID })
    saveLastModel(providerID, modelID)
  }

  const clearModel = () => {
    setSelectedModel(null)
    clearLastModel()
  }

  return {
    sessions,
    currentSessionId,
    messages,
    isStreaming,
    connected,
    error,
    pendingPermissions,
    pendingQuestions,
    selectedModel,
    providers,
    commands,
    createSession,
    switchSession,
    sendMessage,
    cancel,
    compact,
    replyPermission,
    replyQuestion,
    rejectQuestion,
    runCommand,
    selectModel,
    clearModel,
    refreshSessions,
    refreshProviders,
  }
}
