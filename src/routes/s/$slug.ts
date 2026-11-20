import { createFileRoute } from "@tanstack/react-router";
import { publishedHtml } from "@/server/projects";

// Public (everyapp.config.ts): anyone with the link opens the published app.
// It is served under a sandbox policy, so its scripts run in an opaque
// origin with no reach into this app, its cookies or its storage.
const POLICY =
  "sandbox allow-scripts allow-forms allow-modals allow-popups allow-downloads";

export const Route = createFileRoute("/s/$slug")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { slug: string } }) => {
        const html = await publishedHtml(params.slug);
        if (html === null) {
          return new Response("Not found", {
            status: 404,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "content-security-policy": POLICY,
            "cache-control": "no-store",
            "referrer-policy": "no-referrer",
          },
        });
      },
    },
  },
});
