import { useState } from "react";
import { FormDialog } from "@/client/components/FormDialog";
import { Button } from "@/client/components/ui/button";
import { Label } from "@/client/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import type { Project } from "./types";

export function PublishDialog({
  project,
  onPublish,
  onUnpublish,
  onClose,
}: {
  project: Project;
  onPublish: (versionId: string) => Promise<void>;
  onUnpublish: () => Promise<void>;
  onClose: () => void;
}) {
  const [versionId, setVersionId] = useState(
    project.currentVersionId ?? project.versions[0]?.id ?? "",
  );
  const [pending, setPending] = useState<"publish" | "unpublish" | null>(null);
  const items = project.versions.map((version) => ({
    value: version.id,
    label: `v${version.number}${version.id === project.currentVersionId ? " (current)" : ""}`,
  }));

  async function run(kind: "publish" | "unpublish") {
    setPending(kind);
    try {
      await (kind === "publish" ? onPublish(versionId) : onUnpublish());
      onClose();
    } finally {
      setPending(null);
    }
  }

  return (
    <FormDialog
      title="Publish"
      onClose={onClose}
      actions={
        <>
          {project.publishedVersionId && (
            <Button
              data-testid="unpublish"
              variant="outline"
              className="sm:mr-auto"
              pending={pending === "unpublish"}
              disabled={pending !== null}
              onClick={() => void run("unpublish")}
            >
              Unpublish
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onClose}
            disabled={pending !== null}
          >
            Cancel
          </Button>
          <Button
            data-testid="publish-confirm"
            pending={pending === "publish"}
            disabled={pending !== null || !versionId}
            onClick={() => void run("publish")}
          >
            {project.publishedVersionId ? "Update link" : "Publish"}
          </Button>
        </>
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Build or save a version first.
        </p>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="publish-version">Version</Label>
          <Select
            items={items}
            value={versionId}
            onValueChange={(value) => {
              if (value !== null) setVersionId(value);
            }}
          >
            <SelectTrigger
              id="publish-version"
              data-testid="publish-version"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Anyone with the link can open it.
          </p>
        </div>
      )}
    </FormDialog>
  );
}
