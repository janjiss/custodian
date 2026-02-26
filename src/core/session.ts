import { eq } from "drizzle-orm"
import { getDb } from "../db/migrate"
import { sessions, messages, snapshots, reviewState } from "../db/schema"

function generateId(): string {
  return crypto.randomUUID()
}

export interface LocalSession {
  id: string
  title: string | null
  opencodeSessionId: string | null
  mode: string
  createdAt: Date
  updatedAt: Date
}

export const SessionStore = {
  async create(opts: {
    title?: string
    opencodeSessionId?: string
    mode?: string
  }): Promise<LocalSession> {
    const db = getDb()
    const now = new Date()
    const session = {
      id: generateId(),
      title: opts.title ?? null,
      opencodeSessionId: opts.opencodeSessionId ?? null,
      mode: opts.mode ?? "agent",
      createdAt: now,
      updatedAt: now,
    }

    await db.insert(sessions).values(session)
    return session
  },

  async list(): Promise<LocalSession[]> {
    const db = getDb()
    const rows = await db.select().from(sessions).orderBy(sessions.createdAt)
    return rows as LocalSession[]
  },

  async get(id: string): Promise<LocalSession | null> {
    const db = getDb()
    const rows = await db.select().from(sessions).where(eq(sessions.id, id))
    return (rows[0] as LocalSession) ?? null
  },

  async saveMessage(opts: {
    sessionId: string
    role: string
    content: string
    toolCalls?: string
  }): Promise<void> {
    const db = getDb()
    await db.insert(messages).values({
      id: generateId(),
      sessionId: opts.sessionId,
      role: opts.role,
      content: opts.content,
      toolCalls: opts.toolCalls ?? null,
      createdAt: new Date(),
    })
  },

  async getMessages(sessionId: string) {
    const db = getDb()
    return db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(messages.createdAt)
  },

  async saveSnapshot(opts: {
    sessionId: string
    filePath: string
    contentBefore?: string
    contentAfter?: string
    diffText?: string
  }): Promise<void> {
    const db = getDb()
    await db.insert(snapshots).values({
      id: generateId(),
      sessionId: opts.sessionId,
      filePath: opts.filePath,
      contentBefore: opts.contentBefore ?? null,
      contentAfter: opts.contentAfter ?? null,
      diffText: opts.diffText ?? null,
      createdAt: new Date(),
    })
  },

  async getSnapshots(sessionId: string) {
    const db = getDb()
    return db
      .select()
      .from(snapshots)
      .where(eq(snapshots.sessionId, sessionId))
      .orderBy(snapshots.createdAt)
  },

  async setReviewStatus(opts: {
    sessionId: string
    filePath: string
    status: string
  }): Promise<void> {
    const db = getDb()
    const existing = await db
      .select()
      .from(reviewState)
      .where(eq(reviewState.sessionId, opts.sessionId))

    const match = existing.find((r) => r.filePath === opts.filePath)

    if (match) {
      await db
        .update(reviewState)
        .set({ status: opts.status, reviewedAt: new Date() })
        .where(eq(reviewState.id, match.id))
    } else {
      await db.insert(reviewState).values({
        id: generateId(),
        sessionId: opts.sessionId,
        filePath: opts.filePath,
        status: opts.status,
        reviewedAt: new Date(),
      })
    }
  },

  async getReviewState(sessionId: string) {
    const db = getDb()
    return db
      .select()
      .from(reviewState)
      .where(eq(reviewState.sessionId, sessionId))
  },
}
