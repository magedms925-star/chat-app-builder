import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

/** Members who have used the app, keyed by the Gateway's user id. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: text("created_at").notNull().default(now),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    // The Gateway's user id of the owner; every query filters by it.
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    currentVersionId: text("current_version_id"),
    // Set at the first publish and kept, so republishing reuses the link.
    slug: text("slug"),
    publishedVersionId: text("published_version_id"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    index("projects_user_idx").on(table.userId, table.updatedAt),
    uniqueIndex("projects_slug_idx").on(table.slug),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    // A user message: queued, working, done, failed or unavailable.
    status: text("status", {
      enum: ["queued", "working", "done", "failed", "unavailable"],
    })
      .notNull()
      .default("done"),
    error: text("error"),
    versionId: text("version_id"),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [
    index("messages_project_idx").on(table.projectId, table.createdAt),
  ],
);

export const versions = sqliteTable(
  "versions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    source: text("source", { enum: ["ai", "manual", "restore"] }).notNull(),
    summary: text("summary").notNull(),
    html: text("html").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("versions_number_idx").on(table.projectId, table.number),
  ],
);
