type Listener<T = unknown> = (data: T) => void

const listeners = new Map<string, Set<Listener>>()

export const Bus = {
  on<T = unknown>(event: string, fn: Listener<T>): () => void {
    if (!listeners.has(event)) listeners.set(event, new Set())
    const set = listeners.get(event)!
    set.add(fn as Listener)
    return () => set.delete(fn as Listener)
  },

  emit<T = unknown>(event: string, data: T): void {
    const set = listeners.get(event)
    if (set) {
      for (const fn of set) fn(data)
    }
  },

  off(event: string): void {
    listeners.delete(event)
  },
}

export const Events = {
  FILE_CHANGED: "file:changed",
  SESSION_CREATED: "session:created",
  SESSION_SWITCHED: "session:switched",
  AGENT_MESSAGE: "agent:message",
  AGENT_TOOL_USE: "agent:tool_use",
  MODE_CHANGED: "mode:changed",
  DIFF_UPDATED: "diff:updated",
} as const
