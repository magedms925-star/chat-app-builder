import { describe, expect, it } from "vitest";
import { buildMessages, parseAnswer } from "./generation";

describe("parseAnswer", () => {
  it("takes the html block and the sentence around it", () => {
    const answer =
      "Made a timer.\n\n```html\n<!doctype html><h1>Timer</h1>\n```\n";
    expect(parseAnswer(answer)).toEqual({
      summary: "Made a timer.",
      html: "<!doctype html><h1>Timer</h1>",
    });
  });

  it("takes a bare document when there is no block", () => {
    const answer =
      "Here you go: <!DOCTYPE html><html><body>Hi</body></html> Enjoy.";
    expect(parseAnswer(answer)).toEqual({
      summary: "Here you go: Enjoy.",
      html: "<!DOCTYPE html><html><body>Hi</body></html>",
    });
  });

  it("uses the largest block", () => {
    const answer =
      "Done.\n```css\nb{}\n```\n```html\n<html><body>Big app</body></html>\n```";
    expect(parseAnswer(answer).html).toBe("<html><body>Big app</body></html>");
  });

  it("refuses an answer without an app", () => {
    expect(() => parseAnswer("I can't do that.")).toThrow();
  });

  it("gives a default summary", () => {
    expect(parseAnswer("```html\n<p>x</p>\n```").summary).toBe(
      "Updated the app.",
    );
  });
});

describe("buildMessages", () => {
  it("sends the current code with the request", () => {
    const messages = buildMessages(
      [{ role: "user", content: "a clock" }],
      "<p>clock</p>",
      "make it red",
    );
    expect(messages[0]!.role).toBe("system");
    expect(messages.at(-1)!.content).toContain("<p>clock</p>");
    expect(messages.at(-1)!.content).toContain("make it red");
  });

  it("sends the request alone before any code", () => {
    expect(buildMessages([], null, "a clock").at(-1)).toEqual({
      role: "user",
      content: "a clock",
    });
  });
});
