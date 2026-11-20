import { Monitor, RotateCw, Smartphone } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { EmptyState } from "@/client/components/EmptyState";
import { SegmentedToggle } from "@/client/components/SegmentedToggle";
import { Button } from "@/client/components/ui/button";

type Device = "desktop" | "phone";

// Scripts run, but without allow-same-origin the frame gets an opaque
// origin: it can't reach this app, its cookies or its storage.
const SANDBOX = "allow-scripts allow-forms allow-modals allow-popups";

export function Preview({
  html,
  banner,
}: {
  html: string | null;
  banner?: React.ReactNode;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const [reloads, setReloads] = useState(0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <SegmentedToggle
          showLabels
          value={device}
          onChange={setDevice}
          items={[
            { value: "desktop", label: "Desktop", icon: <Monitor /> },
            { value: "phone", label: "Phone", icon: <Smartphone /> },
          ]}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Reload preview"
          title="Reload preview"
          disabled={html === null}
          onClick={() => setReloads((count) => count + 1)}
        >
          <RotateCw />
        </Button>
      </div>
      {banner}
      {html === null ? (
        <div data-testid="preview-empty">
          <EmptyState
            title="Nothing to preview yet"
            description="The app appears here once it's built."
          />
        </div>
      ) : (
        <div
          data-testid="preview-device"
          data-device={device}
          className="flex justify-center rounded-xl border border-border bg-muted p-2"
        >
          <iframe
            key={reloads}
            data-testid="preview-frame"
            title="Preview"
            sandbox={SANDBOX}
            srcDoc={html}
            className={cn(
              "rounded-lg border border-border bg-background",
              device === "phone"
                ? "h-[680px] w-[390px] max-w-full"
                : "h-[70vh] min-h-[480px] w-full",
            )}
          />
        </div>
      )}
    </div>
  );
}
