import { EmptyState } from "@/client/components/EmptyState";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { formatTime } from "@/client/lib/format";
import { SOURCE_LABELS, type Version } from "./types";

export function Versions({
  versions,
  currentVersionId,
  previewingId,
  restoringId,
  onPreview,
  onRestore,
}: {
  versions: Version[];
  currentVersionId: string | null;
  previewingId: string | null;
  restoringId: string | null;
  onPreview: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  if (versions.length === 0) {
    return (
      <EmptyState
        title="No versions yet"
        description="Each build and each saved edit becomes a version."
      />
    );
  }
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {versions.map((version) => {
        const current = version.id === currentVersionId;
        return (
          <li
            key={version.id}
            data-testid="version-row"
            className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">v{version.number}</span>
                <Badge variant="secondary">
                  {SOURCE_LABELS[version.source]}
                </Badge>
                {current && <Badge variant="soft">Current</Badge>}
                <span
                  className="text-xs text-muted-foreground"
                  suppressHydrationWarning
                >
                  {formatTime(version.createdAt)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{version.summary}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant={previewingId === version.id ? "secondary" : "outline"}
                onClick={() => onPreview(version.id)}
              >
                Preview
              </Button>
              {!current && (
                <Button
                  size="sm"
                  variant="outline"
                  pending={restoringId === version.id}
                  disabled={restoringId !== null}
                  onClick={() => onRestore(version.id)}
                >
                  Restore
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
