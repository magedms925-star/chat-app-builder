import type { getProject } from "@/serverFunctions/projects";

export type Project = NonNullable<Awaited<ReturnType<typeof getProject>>>;
export type Message = Project["messages"][number];
export type Version = Project["versions"][number];

export const SOURCE_LABELS: Record<Version["source"], string> = {
  ai: "AI",
  manual: "Manual",
  restore: "Restored",
};

/** True while a message waits for or is being built. */
export function isBusy(messages: Message[]): boolean {
  return messages.some(
    (message) => message.status === "queued" || message.status === "working",
  );
}
