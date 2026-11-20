import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { buildQueued } from "@/server/build";
import * as projects from "@/server/projects";

// Every function runs behind ensureUserMiddleware, and every query takes the
// signed-in member's id: a project is only ever its owner's.

export const getProjects = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context: { user } }) => {
    await projects.rememberUser(user);
    return projects.listProjects(user.id);
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.createProjectInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    await projects.rememberUser(user);
    return projects.createProject(user.id, data);
  });

export const getProject = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    const project = await projects.getProject(user.id, data.projectId);
    if (!project) return null;
    // The public link on the host this request came to.
    const origin = new URL(getRequest().url).origin;
    return {
      ...project,
      shareUrl: project.slug ? `${origin}/s/${project.slug}` : null,
    };
  });

export const renameProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.renameProjectInput.parse(data))
  .handler(({ data, context: { user } }) =>
    projects.renameProject(user.id, data),
  );

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(({ data, context: { user } }) =>
    projects.deleteProject(user.id, data.projectId),
  );

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.sendMessageInput.parse(data))
  .handler(({ data, context: { user } }) =>
    projects.sendMessage(user.id, data),
  );

export const buildNext = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(({ data, context: { user } }) =>
    buildQueued(user.id, data.projectId),
  );

export const saveCode = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.saveCodeInput.parse(data))
  .handler(({ data, context: { user } }) => projects.saveCode(user.id, data));

export const getVersionHtml = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.versionInput.parse(data))
  .handler(({ data, context: { user } }) =>
    projects.getVersionHtml(user.id, data),
  );

export const restoreVersion = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.versionInput.parse(data))
  .handler(({ data, context: { user } }) =>
    projects.restoreVersion(user.id, data),
  );

export const publishProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.publishInput.parse(data))
  .handler(({ data, context: { user } }) => projects.publish(user.id, data));

export const unpublishProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(({ data, context: { user } }) =>
    projects.unpublish(user.id, data.projectId),
  );
