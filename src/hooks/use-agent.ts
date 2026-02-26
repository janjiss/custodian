import { createSignal, createResource, onMount, onCleanup } from "solid-js"
import {
  getAgentClient,
  type AgentSession,
  type AgentMessage,
  type AgentEvent,
} from "../core/agent"

export function useAgent() {
  const client = getAgentClient()

  const [currentSessionId, setCurrentSessionId] = createSignal<string | null>(null)
  const [messages, setMessages] = createSignal<AgentMessage[]>([])
  const [isStreaming, setIsStreaming] = createSignal(false)
  const [connected, setConnected] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const [sessions, { refetch: refreshSessions }] = createResource(async () => {
    try {
      return await client.listSessions()
    } catch {
      return [] as AgentSession[]
    }
  })

  const handleEvent = (event: AgentEvent) => {
    const data = event.data as Record<string, unknown>

    switch (event.type) {
      case "message.created":
      case "message.updated":
      case "message.delta": {
        const msg = data.message as Record<string, unknown> | undefined
        if (!msg) return

        const sessionId = data.sessionId as string ?? data.session_id as string
        if (sessionId && sessionId !== currentSessionId()) return

        const agentMsg: AgentMessage = {
          id: String(msg.id ?? ""),
          role: (msg.role as "user" | "assistant") ?? "assistant",
          content: String(msg.content ?? msg.text ?? ""),
          timestamp: Date.now(),
        }

        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === agentMsg.id)
          if (idx >= 0) {
            const updated = [...prev]
            updated[idx] = agentMsg
            return updated
          }
          return [...prev, agentMsg]
        })
        break
      }
      case "generation.start":
        setIsStreaming(true)
        break
      case "generation.complete":
      case "generation.error":
        setIsStreaming(false)
        break
    }
  }

  onMount(() => {
    const unsubscribe = client.onEvent(handleEvent)

    client.startEventStream().then(() => {
      setConnected(true)
    }).catch((err) => {
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
      refreshSessions()
      return session.id
    } catch {
      return null
    }
  }

  const switchSession = async (id: string) => {
    setCurrentSessionId(id)
    try {
      const session = await client.getSession(id)
      if (session) {
        setMessages(session.messages)
      }
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

    const userMsg: AgentMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      setIsStreaming(true)
      await client.sendMessage(sid, content)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setIsStreaming(false)
    }
  }

  const cancel = async () => {
    const sid = currentSessionId()
    if (sid) {
      await client.cancelGeneration(sid)
      setIsStreaming(false)
    }
  }

  return {
    sessions,
    currentSessionId,
    messages,
    isStreaming,
    connected,
    error,
    createSession,
    switchSession,
    sendMessage,
    cancel,
    refreshSessions,
  }
}
