import { createFileRoute } from "@tanstack/react-router";

// A JSON endpoint for uptime checks. Private: the Gateway answers 401 to
// anyone it hasn't signed in; a monitor uses a personal access token.
export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: () => Response.json({ ok: true }),
    },
  },
});
