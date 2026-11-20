import {
  startRuntime,
  expect,
} from "/home/user/oss-new/control/runtime/index.mjs";
import { createProject } from "./lib.mjs";

// The default stand-in Gateway: no AI model is configured.
const runtime = await startRuntime();
try {
  await runtime.assertPrivateAccess(["/", "/health"]);

  const ownerPage = await (await runtime.context("owner")).newPage();
  const id = await createProject(
    ownerPage,
    expect,
    "Private Budget Board",
    "A board that tracks monthly spending by category.",
  );

  // F002 with no model: building is shown as unavailable.
  await expect(ownerPage.getByTestId("ai-unavailable")).toBeVisible({
    timeout: 15000,
  });
  await expect(ownerPage.getByTestId("building")).toHaveCount(0);

  // A version by hand so the project can be published.
  await ownerPage.getByRole("tab", { name: "Code" }).click();
  await ownerPage
    .getByTestId("code-editor")
    .fill("<!doctype html><h1>Budget board</h1>");
  await ownerPage.getByRole("button", { name: "Save" }).click();
  await ownerPage.getByRole("tab", { name: "Versions" }).click();
  await expect(ownerPage.getByTestId("version-row")).toHaveCount(1);

  // Anonymous and outsider are refused on the project page too.
  for (const role of [undefined, "outsider"]) {
    const res = await runtime.fetch(`/projects/${id}`, role ? { role } : {});
    expect([401, 403]).toContain(res.status);
  }

  // Another member neither lists nor opens the project.
  const memberContext = await runtime.context("member");
  const memberPage = await memberContext.newPage();
  await memberPage.goto("/");
  await expect(memberPage.getByText("No projects yet")).toBeVisible();
  await expect(memberPage.getByText("Private Budget Board")).toHaveCount(0);
  await memberPage.goto(`/projects/${id}`);
  await expect(memberPage.getByText("Project not found")).toBeVisible();
  await expect(memberPage.getByText("Budget board")).toHaveCount(0);
  const raw = await runtime.fetch(`/projects/${id}`, { role: "member" });
  expect(await raw.text()).not.toContain("Private Budget Board");

  // Replaying the owner's own server calls as another member changes nothing.
  const captured = [];
  ownerPage.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/_serverFn/")) {
      captured.push({
        url: request.url(),
        headers: request.headers(),
        body: request.postData(),
      });
    }
  });
  await ownerPage.getByRole("button", { name: "Project actions" }).click();
  await ownerPage.getByRole("menuitem", { name: "Rename" }).click();
  await ownerPage
    .getByRole("dialog")
    .getByLabel("Name")
    .fill("Private Budget Board 2026");
  await ownerPage
    .getByRole("dialog")
    .getByRole("button", { name: "Save" })
    .click();
  await expect(
    ownerPage.getByRole("heading", {
      level: 1,
      name: "Private Budget Board 2026",
    }),
  ).toBeVisible();
  await ownerPage.getByRole("tab", { name: "Code" }).click();
  await ownerPage
    .getByTestId("code-editor")
    .fill("<!doctype html><h1>Budget board v2</h1>");
  await ownerPage.getByRole("button", { name: "Save" }).click();
  await ownerPage.getByRole("button", { name: "Publish" }).click();
  await ownerPage.getByRole("dialog").getByTestId("publish-confirm").click();
  const href = await ownerPage.getByTestId("share-link").getAttribute("href");
  expect(captured.length).toBeGreaterThanOrEqual(3);

  const db = await runtime.database();
  const before = await db
    .prepare("SELECT name, published_version_id FROM projects WHERE id = ?")
    .bind(id)
    .first();
  const versionsBefore = (
    await db
      .prepare("SELECT COUNT(*) AS n FROM versions WHERE project_id = ?")
      .bind(id)
      .first()
  ).n;
  for (const call of captured) {
    const body = (call.body ?? "")
      .replace("Private Budget Board 2026", "Taken over")
      .replace("Budget board v2", "Taken over");
    const headers = Object.fromEntries(
      Object.entries(call.headers).filter(
        ([name]) => !["cookie", "content-length", "host"].includes(name),
      ),
    );
    const url = new URL(call.url);
    const replay = await runtime.fetch(url.pathname + url.search, {
      role: "member",
      method: "POST",
      headers,
      body,
    });
    // It reached the app as the member, which refused it.
    expect([401, 403]).not.toContain(replay.status);
  }
  const after = await db
    .prepare("SELECT name, published_version_id FROM projects WHERE id = ?")
    .bind(id)
    .first();
  expect(after).toEqual(before);
  expect(
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM versions WHERE project_id = ?")
        .bind(id)
        .first()
    ).n,
  ).toBe(versionsBefore);
  const { results: memberRows } = await db
    .prepare("SELECT id FROM projects WHERE user_id = 'member'")
    .all();
  expect(memberRows).toEqual([]);

  // The public link exposes only the published HTML, sandboxed.
  const path = new URL(href).pathname;
  const shared = await runtime.fetch(path);
  expect(shared.status).toBe(200);
  expect(shared.headers.get("content-security-policy")).toMatch(/sandbox/);
  expect(shared.headers.get("content-security-policy")).not.toMatch(
    /allow-same-origin/,
  );
  const html = await shared.text();
  expect(html).toContain("Budget board v2");
  for (const leak of ["owner@example.test", "Private Budget Board", id])
    expect(html).not.toContain(leak);
  expect((await runtime.fetch("/s/not-a-real-slug-000000")).status).toBe(404);
  expect((await runtime.fetch(`/s/${id}`)).status).toBe(404);
  // Only GET is public; other routes stay private for visitors.
  expect([401, 403, 404, 405]).toContain(
    (await runtime.fetch(path, { method: "POST" })).status,
  );
  expect([401, 403]).toContain((await runtime.fetch(`/projects/${id}`)).status);

  // No sign-in page of the app's own.
  for (const p of ["/login", "/signin", "/sign-in", "/signup", "/logout"]) {
    const res = await runtime.fetch(p, { role: "member" });
    expect(res.status).toBe(404);
  }
} finally {
  await runtime.close();
}
