import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { messages, projects, users, versions } from "@/db/schema";

const id = z.string().uuid();
const name = z.string().trim().min(1, "Give the project a name").max(80);
const description = z.string().trim().min(1, "Describe the app").max(4000);

export const createProjectInput = z.object({ name, description }).strict();
export const projectIdInput = z.object({ projectId: id }).strict();
export const renameProjectInput = z.object({ projectId: id, name }).strict();
export const sendMessageInput = z
  .object({ projectId: id, content: description })
  .strict();
export const saveCodeInput = z
  .object({
    projectId: id,
    html: z
      .string()
      .max(500_000, "The code is too long")
      .refine((value) => value.trim().length > 0, "Code can't be empty."),
  })
  .strict();
export const versionInput = z.object({ projectId: id, versionId: id }).strict();
export const publishInput = z
  .object({ projectId: id, versionId: id.optional() })
  .strict();

/** A working generation older than this is treated as lost. */
const STALE_MS = 5 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

/** Records the member on first sight, with the email the Gateway sent. */
export async function rememberUser(user: { id: string; email: string }) {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email })
    .onConflictDoUpdate({ target: users.id, set: { email: user.email } });
}

export function listProjects(userId: string) {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      updatedAt: projects.updatedAt,
      published:
        sql<boolean>`${projects.publishedVersionId} is not null`.mapWith(
          Boolean,
        ),
    })
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.updatedAt), projects.id);
}

/** The project when this user owns it, else null. */
async function ownedProject(userId: string, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  return project ?? null;
}

class NotFoundError extends Error {
  constructor() {
    super("Project not found");
  }
}

async function requireProject(userId: string, projectId: string) {
  const project = await ownedProject(userId, projectId);
  if (!project) throw new NotFoundError();
  return project;
}

/** A new project whose description waits as its first message. */
export async function createProject(
  userId: string,
  input: z.infer<typeof createProjectInput>,
) {
  const projectId = crypto.randomUUID();
  const at = nowIso();
  await db.batch([
    db.insert(projects).values({
      id: projectId,
      userId,
      name: input.name,
      createdAt: at,
      updatedAt: at,
    }),
    db.insert(messages).values({
      id: crypto.randomUUID(),
      projectId,
      role: "user",
      content: input.description,
      status: "queued",
      createdAt: at,
    }),
  ]);
  return { id: projectId };
}

export async function renameProject(
  userId: string,
  input: z.infer<typeof renameProjectInput>,
) {
  await requireProject(userId, input.projectId);
  await db
    .update(projects)
    .set({ name: input.name, updatedAt: nowIso() })
    .where(and(eq(projects.id, input.projectId), eq(projects.userId, userId)));
}

export async function deleteProject(userId: string, projectId: string) {
  await requireProject(userId, projectId);
  await db.batch([
    db.delete(messages).where(eq(messages.projectId, projectId)),
    db.delete(versions).where(eq(versions.projectId, projectId)),
    db
      .delete(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId))),
  ]);
}

/** Everything the project page shows; the code of the current version only. */
export async function getProject(userId: string, projectId: string) {
  const project = await ownedProject(userId, projectId);
  if (!project) return null;
  await failStale(projectId);
  const [conversation, history, current] = await Promise.all([
    db
      .select({
        id: messages.id,
        role: messages.role,
        content: messages.content,
        status: messages.status,
        error: messages.error,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.projectId, projectId))
      .orderBy(asc(messages.createdAt), desc(messages.role)),
    db
      .select({
        id: versions.id,
        number: versions.number,
        source: versions.source,
        summary: versions.summary,
        createdAt: versions.createdAt,
      })
      .from(versions)
      .where(eq(versions.projectId, projectId))
      .orderBy(desc(versions.number)),
    project.currentVersionId
      ? db
          .select({ html: versions.html })
          .from(versions)
          .where(
            and(
              eq(versions.id, project.currentVersionId),
              eq(versions.projectId, projectId),
            ),
          )
      : Promise.resolve([]),
  ]);
  return {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    currentVersionId: project.currentVersionId,
    publishedVersionId: project.publishedVersionId,
    slug: project.publishedVersionId ? project.slug : null,
    html: current[0]?.html ?? null,
    messages: conversation,
    versions: history,
  };
}

async function failStale(projectId: string) {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  await db
    .update(messages)
    .set({ status: "failed", error: "This build took too long." })
    .where(
      and(
        eq(messages.projectId, projectId),
        eq(messages.status, "working"),
        sql`${messages.createdAt} < ${cutoff}`,
      ),
    );
}

export async function getVersionHtml(
  userId: string,
  input: z.infer<typeof versionInput>,
) {
  await requireProject(userId, input.projectId);
  const [version] = await db
    .select({ html: versions.html })
    .from(versions)
    .where(
      and(
        eq(versions.id, input.versionId),
        eq(versions.projectId, input.projectId),
      ),
    );
  if (!version) throw new NotFoundError();
  return version;
}

class BusyError extends Error {
  constructor() {
    super("Wait for the current build to finish.");
  }
}

/** Queues a message for the builder; refused while another is in progress. */
export async function sendMessage(
  userId: string,
  input: z.infer<typeof sendMessageInput>,
) {
  await requireProject(userId, input.projectId);
  await failStale(input.projectId);
  const messageId = crypto.randomUUID();
  // One statement, so two sends at once can't both get in.
  const inserted = await db.run(sql`
    INSERT INTO messages (id, project_id, role, content, status, created_at)
    SELECT ${messageId}, ${input.projectId}, 'user', ${input.content}, 'queued', ${nowIso()}
    WHERE NOT EXISTS (
      SELECT 1 FROM messages WHERE project_id = ${input.projectId}
        AND status IN ('queued', 'working')
    )`);
  if (!inserted.meta.changes) throw new BusyError();
  return { id: messageId };
}

/** Claims the oldest queued message of the project, or null when none waits. */
export async function claimQueued(userId: string, projectId: string) {
  await requireProject(userId, projectId);
  const [claimed] = await db
    .update(messages)
    .set({ status: "working" })
    .where(
      and(
        eq(messages.projectId, projectId),
        eq(messages.status, "queued"),
        eq(messages.role, "user"),
      ),
    )
    .returning({ id: messages.id, content: messages.content });
  return claimed ?? null;
}

/** The finished turns sent to the model, oldest first, and the current code. */
export async function buildContext(projectId: string, beforeMessageId: string) {
  const turns = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      status: messages.status,
    })
    .from(messages)
    .where(
      and(
        eq(messages.projectId, projectId),
        inArray(messages.status, ["done"]),
      ),
    )
    .orderBy(asc(messages.createdAt), desc(messages.role));
  const [project] = await db
    .select({ currentVersionId: projects.currentVersionId })
    .from(projects)
    .where(eq(projects.id, projectId));
  let html: string | null = null;
  if (project?.currentVersionId) {
    const [version] = await db
      .select({ html: versions.html })
      .from(versions)
      .where(eq(versions.id, project.currentVersionId));
    html = version?.html ?? null;
  }
  return {
    turns: turns
      .filter((turn) => turn.id !== beforeMessageId)
      .map(({ role, content }) => ({ role, content })),
    html,
  };
}

export async function finishMessage(
  messageId: string,
  status: "failed" | "unavailable",
  error: string,
) {
  await db
    .update(messages)
    .set({ status, error })
    .where(eq(messages.id, messageId));
}

async function nextNumber(projectId: string): Promise<number> {
  const [row] = await db
    .select({ last: sql<number | null>`max(${versions.number})` })
    .from(versions)
    .where(eq(versions.projectId, projectId));
  return (row?.last ?? 0) + 1;
}

/** A new version; the unique (project, number) index refuses a race. */
function insertVersion(
  number: number,
  projectId: string,
  versionId: string,
  source: "ai" | "manual" | "restore",
  summary: string,
  html: string,
  at: string,
) {
  return db.insert(versions).values({
    id: versionId,
    projectId,
    number,
    source,
    summary,
    html,
    createdAt: at,
  });
}

function makeCurrent(projectId: string, versionId: string, at: string) {
  return db
    .update(projects)
    .set({ currentVersionId: versionId, updatedAt: at })
    .where(eq(projects.id, projectId));
}

/** The model's answer: a new current version and the reply in the conversation. */
export async function completeMessage(
  projectId: string,
  messageId: string,
  result: { summary: string; html: string },
) {
  const versionId = crypto.randomUUID();
  const at = nowIso();
  const number = await nextNumber(projectId);
  await db.batch([
    insertVersion(
      number,
      projectId,
      versionId,
      "ai",
      result.summary,
      result.html,
      at,
    ),
    db.insert(messages).values({
      id: crypto.randomUUID(),
      projectId,
      role: "assistant",
      content: result.summary,
      versionId,
      createdAt: at,
    }),
    db
      .update(messages)
      .set({ status: "done", versionId })
      .where(eq(messages.id, messageId)),
    makeCurrent(projectId, versionId, at),
  ]);
}

export async function saveCode(
  userId: string,
  input: z.infer<typeof saveCodeInput>,
) {
  await requireProject(userId, input.projectId);
  const versionId = crypto.randomUUID();
  const at = nowIso();
  const number = await nextNumber(input.projectId);
  await db.batch([
    insertVersion(
      number,
      input.projectId,
      versionId,
      "manual",
      "Edited by hand",
      input.html,
      at,
    ),
    makeCurrent(input.projectId, versionId, at),
  ]);
}

/** A new version copying an old one: history is never rewritten. */
export async function restoreVersion(
  userId: string,
  input: z.infer<typeof versionInput>,
) {
  const [source] = await db
    .select({ number: versions.number, html: versions.html })
    .from(versions)
    .innerJoin(projects, eq(projects.id, versions.projectId))
    .where(
      and(
        eq(versions.id, input.versionId),
        eq(versions.projectId, input.projectId),
        eq(projects.userId, userId),
      ),
    );
  if (!source) throw new NotFoundError();
  const versionId = crypto.randomUUID();
  const at = nowIso();
  const number = await nextNumber(input.projectId);
  await db.batch([
    insertVersion(
      number,
      input.projectId,
      versionId,
      "restore",
      `Restored v${source.number}`,
      source.html,
      at,
    ),
    makeCurrent(input.projectId, versionId, at),
  ]);
}

function randomSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}

export async function publish(
  userId: string,
  input: z.infer<typeof publishInput>,
) {
  const project = await requireProject(userId, input.projectId);
  const versionId = input.versionId ?? project.currentVersionId;
  if (!versionId) throw new Error("Make a version before publishing.");
  const [version] = await db
    .select({ id: versions.id })
    .from(versions)
    .where(and(eq(versions.id, versionId), eq(versions.projectId, project.id)));
  if (!version) throw new NotFoundError();
  await db
    .update(projects)
    .set({
      publishedVersionId: version.id,
      slug: project.slug ?? randomSlug(),
      updatedAt: nowIso(),
    })
    .where(and(eq(projects.id, project.id), eq(projects.userId, userId)));
}

export async function unpublish(userId: string, projectId: string) {
  await requireProject(userId, projectId);
  await db
    .update(projects)
    .set({ publishedVersionId: null, updatedAt: nowIso() })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
}

const slugPattern = /^[A-Za-z0-9_-]{24}$/;

/** The published HTML behind a public link, or null. Nothing else leaves. */
export async function publishedHtml(slug: string): Promise<string | null> {
  if (!slugPattern.test(slug)) return null;
  const [row] = await db
    .select({ html: versions.html })
    .from(projects)
    .innerJoin(versions, eq(versions.id, projects.publishedVersionId))
    .where(eq(projects.slug, slug));
  return row?.html ?? null;
}
