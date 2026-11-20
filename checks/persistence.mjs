import {
  startRuntime,
  expect,
} from "/home/user/oss-new/control/runtime/index.mjs";
import { createProject } from "./lib.mjs";

const runtime = await startRuntime();
try {
  let page = await (await runtime.context("owner")).newPage();
  await createProject(
    page,
    expect,
    "Reading List",
    "A list of books to read with a checkbox for each.",
  );
  await expect(page.getByTestId("ai-unavailable")).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("tab", { name: "Code" }).click();
  await page
    .getByTestId("code-editor")
    .fill("<!doctype html><h1>Books for winter</h1>");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.frameLocator('[data-testid="preview-frame"]').getByRole("heading", { name: "Books for winter" })).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await page.getByRole("dialog").getByTestId("publish-confirm").click();
  const path = new URL(
    await page.getByTestId("share-link").getAttribute("href"),
  ).pathname;

  await runtime.restart();

  page = await (await runtime.context("owner")).newPage();
  await page.goto("/");
  const row = page.getByTestId("project-row");
  await expect(row).toContainText("Reading List");
  await expect(row).toContainText("Published");
  await row.getByRole("link", { name: "Reading List" }).click();
  await expect(page.getByTestId("message").first()).toContainText(
    "A list of books to read",
  );
  await expect(
    page
      .frameLocator('[data-testid="preview-frame"]')
      .getByRole("heading", { name: "Books for winter" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Versions" }).click();
  await expect(page.getByTestId("version-row")).toHaveCount(1);
  const shared = await runtime.fetch(path);
  expect(shared.status).toBe(200);
  expect(await shared.text()).toContain("Books for winter");
} finally {
  await runtime.close();
}
