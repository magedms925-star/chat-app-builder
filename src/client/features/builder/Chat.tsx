import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Spinner } from "@/client/components/ui/spinner";
import { Textarea } from "@/client/components/ui/textarea";
import type { Message } from "./types";

export function Chat({
  messages,
  building,
  onSend,
}: {
  messages: Message[];
  building: boolean;
  onSend: (content: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const lastUser = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const unavailable = lastUser?.status === "unavailable";

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, building]);

  async function submit() {
    const content = draft.trim();
    if (!content || building) return;
    if (await onSend(content)) setDraft("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
        {messages.map((message) => (
          <div
            key={message.id}
            data-testid="message"
            data-role={message.role}
            className={cn(
              "max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap",
              message.role === "user"
                ? "self-end bg-primary/10 text-foreground"
                : "self-start border border-border bg-card",
            )}
          >
            {message.content}
            {message.status === "failed" && (
              <p
                data-testid="message-error"
                className="mt-1.5 text-xs text-destructive"
              >
                {message.error}
              </p>
            )}
            {message.status === "unavailable" && (
              <p className="mt-1.5 text-xs text-muted-foreground">Not built</p>
            )}
          </div>
        ))}
        {building && (
          <div
            data-testid="building"
            className="flex items-center gap-2 self-start rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-muted-foreground"
          >
            <Spinner />
            Building…
          </div>
        )}
        <div ref={end} />
      </div>
      {unavailable && !building && (
        <Alert data-testid="ai-unavailable">
          <AlertDescription>{lastUser.error}</AlertDescription>
        </Alert>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Textarea
          aria-label="Message"
          placeholder="Describe a change"
          rows={2}
          maxLength={4000}
          value={draft}
          className="bg-card"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send"
          disabled={building || !draft.trim()}
        >
          <ArrowUp />
        </Button>
      </form>
    </div>
  );
}
