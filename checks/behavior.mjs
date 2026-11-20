import {
  startRuntime,
  expect,
} from "/home/user/oss-new/control/runtime/index.mjs";
import { createProject, withFakeAi } from "./lib.mjs";

const runtime = await startRuntime(withFakeAi);
try {
  const page = await (await runtime.context("owner")).newPage();

  // F001: empty list first.
  await page.goto("/");
  await runtime.assertBackLink(page);
  await expect(page.getByText("No projects yet")).toBeVisible();

  // F001 + F002: creating a project sends its description as the first message.
  const id = await createProject(
    page,
    expect,
    "Dinner Tip Splitter",
    "A tip calculator where I enter the bill and a tip percentage and see the total.",
  );
  const send = page.getByRole("button", { name: "Send" });
  await expect(page.getByTestId("building")).toBeVisible();
  await expect(send).toBeDisabled();
  const messages = page.getByTestId("message");
  await expect(messages.first()).toContainText(
    "A tip calculator where I enter the bill",
  );
  await expect(
    page.getByText("Built a tip calculator with bill and tip inputs."),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("building")).toHaveCount(0);

  // F003: the result runs in a sandboxed frame.
  const frameEl = page.getByTestId("preview-frame");
  await expect(frameEl).toHaveAttribute("sandbox", /allow-scripts/);
  expect(await frameEl.getAttribute("sandbox")).not.toContain(
    "allow-same-origin",
  );
  const frame = page.frameLocator('[data-testid="preview-frame"]');
  await expect(
    frame.getByRole("heading", { name: "Tip calculator" }),
  ).toBeVisible();
  await expect(frame.getByText("Total: $99.71")).toBeVisible();

  // F002: a change gets the current code and becomes the new version.
  await page
    .getByLabel("Message")
    .fill("Split the total between several people.");
  await send.click();
  await expect(
    page.getByText("Added a People field and split the total between them."),
  ).toBeVisible({ timeout: 15000 });
  await expect(frame.getByText("Each pays $33.24")).toBeVisible();

  // F002: a failed generation shows an error and leaves the code as it was.
  await page.getByLabel("Message").fill("Add a photo of each diner next to their share.");
  await send.click();
  await expect(page.getByTestId("message-error")).toBeVisible({
    timeout: 15000,
  });
  await expect(frame.getByText("Each pays $33.24")).toBeVisible();

  // F003: phone width and reload.
  await page.getByRole("button", { name: "Phone", exact: true }).click();
  await expect(page.getByTestId("preview-device")).toHaveAttribute(
    "data-device",
    "phone",
  );
  await page.getByRole("button", { name: "Reload preview" }).click();
  await expect(frame.getByText("Each pays $33.24")).toBeVisible();
  await page.getByRole("button", { name: "Desktop", exact: true }).click();
  await expect(page.getByTestId("preview-device")).toHaveAttribute(
    "data-device",
    "desktop",
  );

  // F005: two AI versions so far.
  await page.getByRole("tab", { name: "Versions" }).click();
  const rows = page.getByTestId("version-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "v2" })).toContainText("AI");

  // F004: edit by hand, discard, refuse empty, save.
  await page.getByRole("tab", { name: "Code" }).click();
  const editor = page.getByTestId("code-editor");
  const original = await editor.inputValue();
  expect(original).toContain("<label>People");
  await editor.fill(
    original.replace("<h1>Tip calculator</h1>", "<h1>Scratch</h1>"),
  );
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(editor).toHaveValue(original);
  await editor.fill("   ");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Code can't be empty.")).toBeVisible();
  await editor.fill(
    original.replace("<h1>Tip calculator</h1>", "<h1>Dinner split</h1>"),
  );
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    frame.getByRole("heading", { name: "Dinner split" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Versions" }).click();
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: "v3" })).toContainText("Manual");

  // F005: preview an old version, then restore it as a new one.
  const v1 = rows.filter({ hasText: "v1" });
  await v1.getByRole("button", { name: "Preview" }).click();
  await expect(frame.getByText("Total: $99.71")).toBeVisible();
  await v1.getByRole("button", { name: "Restore" }).click();
  await expect(rows).toHaveCount(4);
  await expect(rows.filter({ hasText: "v4" })).toContainText("Restored");
  await expect(frame.getByText("Total: $99.71")).toBeVisible();
  const db = await runtime.database();
  const { results: versions } = await db
    .prepare(
      "SELECT number, html FROM versions WHERE project_id = ? ORDER BY number",
    )
    .bind(id)
    .all();
  expect(versions.map((v) => v.number)).toEqual([1, 2, 3, 4]);
  expect(versions[3].html).toBe(versions[0].html);

  // F006: publish a chosen version; anyone can open the link.
  await page.getByRole("button", { name: "Publish" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("publish-version").click();
  await page.getByRole("option", { name: /^v3/ }).click();
  await dialog.getByTestId("publish-confirm").click();
  const link = page.getByTestId("share-link");
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  const shareUrl = new URL(href);
  expect(shareUrl.hostname).toBe(runtime.hostname);
  expect(shareUrl.pathname).toMatch(/^\/s\/[A-Za-z0-9_-]{16,}$/);
  await expect(page.getByTestId("publish-state")).toContainText("v3");
  let shared = await runtime.fetch(shareUrl.pathname);
  expect(shared.status).toBe(200);
  expect(shared.headers.get("content-type")).toContain("text/html");
  expect(shared.headers.get("content-security-policy")).toContain("sandbox");
  let body = await shared.text();
  expect(body).toContain("<h1>Dinner split</h1>");
  expect(body).not.toContain("owner@example.test");
  expect(body).not.toContain(id);

  // The visitor sees the app full screen.
  const visitor = await (await runtime.context(null)).newPage();
  await visitor.goto(shareUrl.pathname);
  await expect(
    visitor.getByRole("heading", { name: "Dinner split" }),
  ).toBeVisible();

  // Republish the current version: same link, newer app.
  await page.getByRole("button", { name: "Publish" }).click();
  await page.getByRole("dialog").getByTestId("publish-confirm").click();
  await expect(page.getByTestId("publish-state")).toContainText("v4");
  await expect(page.getByTestId("share-link")).toHaveAttribute("href", href);
  body = await (await runtime.fetch(shareUrl.pathname)).text();
  expect(body).toContain("Total: $");
  expect(body).not.toContain("Dinner split");

  // Unpublish: the link is gone.
  await page.getByRole("button", { name: "Publish" }).click();
  await page.getByRole("dialog").getByTestId("unpublish").click();
  await expect(page.getByTestId("share-link")).toHaveCount(0);
  expect((await runtime.fetch(shareUrl.pathname)).status).toBe(404);

  // F001: rename.
  await page.getByRole("button", { name: "Project actions" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Name")
    .fill("Group Dinner Splitter");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Group Dinner Splitter" }),
  ).toBeVisible();

  // F001: delete takes messages and versions with it.
  const doomed = await createProject(
    page,
    expect,
    "Old draft",
    "A page that shows a countdown to Friday.",
  );
  await expect(page.getByText("Built a tip calculator")).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "Project actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/"),
    page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete" })
      .click(),
  ]);
  await expect(page.getByTestId("project-row")).toHaveCount(1);
  for (const table of ["projects", "messages", "versions"]) {
    const column = table === "projects" ? "id" : "project_id";
    const row = await db
      .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`)
      .bind(doomed)
      .first();
    expect(row.n).toBe(0);
  }

  // F001 list: name, status, last updated.
  const row = page.getByTestId("project-row");
  await expect(row).toContainText("Group Dinner Splitter");
  await expect(row).toContainText("Draft");

  // Publish again and leave the result on screen.
  await row.getByRole("link", { name: "Group Dinner Splitter" }).click();
  await page.getByRole("button", { name: "Publish" }).click();
  await page.getByRole("dialog").getByTestId("publish-confirm").click();
  await expect(page.getByTestId("share-link")).toHaveAttribute("href", href);
  expect((await runtime.fetch(shareUrl.pathname)).status).toBe(200);
  await page.goto("/");
  await expect(page.getByTestId("project-row")).toContainText("Published");
  await page.getByRole("link", { name: "Group Dinner Splitter" }).click();
  await expect(frame.getByText("Total: $99.71")).toBeVisible();
  await runtime.assertBackLink(page);

  // Phone-sized smoke.
  const phone = await (
    await runtime.context("owner", {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
  ).newPage();
  await phone.goto("/");
  await expect(phone.getByTestId("project-row")).toContainText(
    "Group Dinner Splitter",
  );
  await phone.getByRole("link", { name: "Group Dinner Splitter" }).click();
  await expect(phone.getByLabel("Message")).toBeVisible();
  await expect(
    phone
      .frameLocator('[data-testid="preview-frame"]')
      .getByText("Total: $99.71"),
  ).toBeVisible();

  await runtime.screenshot(page);
} finally {
  await runtime.close();
}
