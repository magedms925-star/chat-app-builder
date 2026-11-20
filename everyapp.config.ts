import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "chat-app-builder",
  name: "Chat App Builder",
  description:
    "Describe a web app in chat, watch it take shape in a live preview, and share it with a link.",
  icon: "/icon.svg",
  resources: {
    d1: ["DB"],
  },
  public: [{ path: "/s/:slug" }],
  ai: {
    chat: {
      why: "Writes and changes each project's app from the conversation.",
    },
  },
});
