import { useState } from "react";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Textarea } from "@/client/components/ui/textarea";

/** Remount it (key) when the current version changes. */
export function CodeEditor({
  original,
  onSave,
}: {
  original: string;
  onSave: (html: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(original);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = draft !== original;

  async function save() {
    if (!draft.trim()) {
      setError("Code can't be empty.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onSave(draft);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        data-testid="code-editor"
        aria-label="Code"
        spellCheck={false}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="h-[60vh] resize-none bg-card font-mono text-xs leading-relaxed"
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          disabled={!changed || pending}
          onClick={() => {
            setDraft(original);
            setError(null);
          }}
        >
          Discard
        </Button>
        <Button
          disabled={!changed}
          pending={pending}
          onClick={() => void save()}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
