/** A readable message from a server function's error, zod's included. */
export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  try {
    const issues = JSON.parse(message) as { message?: string }[];
    if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
  } catch {
    // Not zod's list: the message as it is.
  }
  return message || "Something went wrong.";
}

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatTime(iso: string): string {
  return formatter.format(new Date(iso));
}
