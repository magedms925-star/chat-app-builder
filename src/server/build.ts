import { env } from "cloudflare:workers";
import {
  aiBaseUrl,
  createGatewayFetch,
  gatewayRefusal,
  refusalFromError,
} from "@every-app/sdk/server";
import { buildMessages, parseAnswer } from "@/server/generation";
import * as projects from "@/server/projects";

const UNAVAILABLE =
  "Building is unavailable: no AI model is set up for this workspace.";
const FAILED = "This change couldn't be built. Try again or rephrase it.";

function isUnavailable(code: string | undefined): boolean {
  return (
    !!code &&
    (code.endsWith("_not_configured") || code === "provider_not_allowed")
  );
}

/**
 * Builds the project's queued message: the model gets the conversation and
 * the current code, and its app becomes the new current version. A failure
 * is kept on the message and leaves the code as it was.
 */
export async function buildQueued(userId: string, projectId: string) {
  const message = await projects.claimQueued(userId, projectId);
  if (!message) return { status: "idle" as const };
  try {
    const context = await projects.buildContext(projectId, message.id);
    const gatewayFetch = createGatewayFetch({ env });
    const response = await gatewayFetch(`${aiBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "default",
        messages: buildMessages(context.turns, context.html, message.content),
      }),
    });
    if (!response.ok) {
      const refusal = await gatewayRefusal(response);
      if (isUnavailable(refusal?.code)) {
        await projects.finishMessage(message.id, "unavailable", UNAVAILABLE);
        return { status: "unavailable" as const };
      }
      console.error("build failed", response.status, refusal?.code);
      await projects.finishMessage(message.id, "failed", FAILED);
      return { status: "failed" as const };
    }
    const body = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const answer = body.choices?.[0]?.message?.content ?? "";
    const result = parseAnswer(answer);
    await projects.completeMessage(projectId, message.id, result);
    return { status: "done" as const };
  } catch (error) {
    if (isUnavailable(refusalFromError(error)?.code)) {
      await projects.finishMessage(message.id, "unavailable", UNAVAILABLE);
      return { status: "unavailable" as const };
    }
    console.error("build failed", error);
    await projects.finishMessage(message.id, "failed", FAILED);
    return { status: "failed" as const };
  }
}
