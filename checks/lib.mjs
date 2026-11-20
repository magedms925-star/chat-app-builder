// Shared by the suites: a local stand-in for the Gateway's AI route, so the
// build-by-chat path can be exercised without a real model.
const V1 = `<!doctype html><html><head><meta charset="utf-8"><title>Tip calculator</title><style>
body{font-family:system-ui,sans-serif;margin:0;padding:32px;background:#f4f1ea;color:#1f2933}
.card{max-width:360px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;box-shadow:0 6px 24px rgba(0,0,0,.08)}
label{display:block;margin-top:14px;font-size:14px;color:#52606d}input{width:100%;padding:10px;margin-top:6px;border:1px solid #cbd2d9;border-radius:8px;font-size:16px;box-sizing:border-box}
.total{margin-top:20px;font-size:28px;font-weight:700}</style></head><body><div class="card"><h1>Tip calculator</h1>
<label>Bill amount<input id="bill" type="number" value="84.50"></label><label>Tip %<input id="tip" type="number" value="18"></label>
<div class="total" id="out"></div></div><script>
function calc(){var b=+bill.value||0,t=+tip.value||0;out.textContent="Total: $"+(b*(1+t/100)).toFixed(2)}
bill.oninput=tip.oninput=calc;calc();</script></body></html>`;

const V2 = V1.replace(
  '<div class="total" id="out"></div>',
  '<label>People<input id="people" type="number" value="3"></label><div class="total" id="out"></div>',
)
  .replace(
    'out.textContent="Total: $"+(b*(1+t/100)).toFixed(2)}',
    'var p=Math.max(1,+people.value||1);out.textContent="Each pays $"+(b*(1+t/100)/p).toFixed(2)}',
  )
  .replace(
    "bill.oninput=tip.oninput=calc",
    "bill.oninput=tip.oninput=people.oninput=calc",
  );

export const HTML = { V1, V2 };

const FAKE_AI = `
const V1 = ${JSON.stringify(V1)};
const V2 = ${JSON.stringify(V2)};
export default { async fetch(request) {
  const url = new URL(request.url);
  if (request.method !== "POST" || !url.pathname.endsWith("/chat/completions")) {
    const code = "integration_not_configured";
    return Response.json({ error: "Service Unavailable", code, message: "Not configured here." }, { status: 503, headers: { "x-everyapp-error": code } });
  }
  const body = await request.json();
  const messages = body.messages ?? [];
  const last = String(messages.at(-1)?.content ?? "");
  if (last.includes("photo of each diner")) return Response.json({ error: { message: "upstream failure" } }, { status: 500 });
  const turns = messages.filter((m) => m.role === "user").length;
  let content;
  if (turns >= 2) {
    // A change must be made to the current code, so the request carries it.
    if (!last.includes("Tip calculator")) return Response.json({ error: { message: "no current code sent" } }, { status: 400 });
    content = "Added a People field and split the total between them.\\n\\n\`\`\`html\\n" + V2 + "\\n\`\`\`";
  } else {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    content = "Built a tip calculator with bill and tip inputs.\\n\\n\`\`\`html\\n" + V1 + "\\n\`\`\`";
  }
  return Response.json({ id: "chatcmpl-local", object: "chat.completion", created: 0, model: "local",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }] });
} };`;

/** startRuntime options that answer AI calls with the stand-in above. */
export const withFakeAi = {
  bindings: {
    EVERY_APP_GATEWAY: { type: "worker", worker: "fake-ai-gateway" },
  },
  workers: [
    {
      config: {
        name: "fake-ai-gateway",
        compatibilityDate: "2025-09-01",
        manifest: {
          mainModule: "fake.mjs",
          modules: { "fake.mjs": { type: "esm", contents: FAKE_AI } },
        },
      },
    },
  ],
};

/** Creates a project through the New project dialog and waits for its page. */
export async function createProject(page, expect, name, description) {
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Describe the app").fill(description);
  await Promise.all([
    page.waitForURL(/\/projects\/[^/]+$/),
    dialog.getByRole("button", { name: "Create" }).click(),
  ]);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return page.url().split("/projects/")[1];
}
