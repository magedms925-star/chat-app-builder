/** What the model is told, and how its answer becomes a version. Pure, so it is unit tested. */

const SYSTEM_PROMPT = [
  "You build small web apps from a person's description.",
  "Answer with one or two plain sentences saying what you built or changed, then the complete app as one HTML file in a single ```html code block.",
  "Put all CSS in <style> and all JavaScript in <script> inside that file. Do not link local files.",
  "The app runs in a sandboxed frame with no cookies, no localStorage and no backend, so keep its state in memory.",
  "Make it responsive so it works at phone width. When there is current code, change it as asked and return the whole file again.",
].join(" ");

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const MAX_TURNS = 20;

export function buildMessages(
  turns: Turn[],
  html: string | null,
  request: string,
) {
  const last = html
    ? `Current code:\n\`\`\`html\n${html}\n\`\`\`\n\nChange: ${request}`
    : request;
  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...turns.slice(-MAX_TURNS),
    { role: "user" as const, content: last },
  ];
}

class UnusableAnswerError extends Error {}

/** The summary and HTML in a model's answer; throws when it holds no app. */
export function parseAnswer(answer: string): { summary: string; html: string } {
  const blocks = [...answer.matchAll(/```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)```/g)];
  let html: string | undefined;
  let rest = answer;
  if (blocks.length > 0) {
    const largest = blocks.reduce((a, b) =>
      b[1]!.length > a[1]!.length ? b : a,
    );
    html = largest[1]!.trim();
    rest =
      answer.slice(0, largest.index) +
      answer.slice(largest.index! + largest[0].length);
  } else {
    const start = answer.search(/<!doctype html|<html[\s>]/i);
    if (start >= 0) {
      const end = answer.toLowerCase().lastIndexOf("</html>");
      const stop = end >= 0 ? end + "</html>".length : answer.length;
      html = answer.slice(start, stop).trim();
      rest = answer.slice(0, start) + answer.slice(stop);
    }
  }
  if (!html || !/<[a-z!]/i.test(html)) {
    throw new UnusableAnswerError("The answer had no app in it.");
  }
  let summary = rest.replace(/\s+/g, " ").trim();
  if (summary.length > 280) summary = `${summary.slice(0, 277).trimEnd()}…`;
  return { summary: summary || "Updated the app.", html };
}
