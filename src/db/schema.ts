import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  title: text("title"),
  opencodeSessionId: text("opencode_session_id"),
  mode: text("mode").notNull().default("agent"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolCalls: text("tool_calls"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

export const snapshots = sqliteTable("snapshots", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  filePath: text("file_path").notNull(),
  contentBefore: text("content_before"),
  contentAfter: text("content_after"),
  diffText: text("diff_text"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

export const reviewState = sqliteTable("review_state", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  filePath: text("file_path").notNull(),
  status: text("status").notNull().default("pending"),
  reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
})
