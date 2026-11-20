import {
  createFileRoute,
  notFound,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { Ellipsis, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { CopyButton } from "@/client/components/CopyButton";
import { FormDialog } from "@/client/components/FormDialog";
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/client/components/ui/tabs";
import { Chat } from "@/client/features/builder/Chat";
import { CodeEditor } from "@/client/features/builder/CodeEditor";
import { Preview } from "@/client/features/builder/Preview";
import { PublishDialog } from "@/client/features/builder/PublishDialog";
import { Versions } from "@/client/features/builder/Versions";
import { isBusy } from "@/client/features/builder/types";
import { errorMessage } from "@/client/lib/format";
import {
  buildNext,
  deleteProject,
  getProject,
  getVersionHtml,
  publishProject,
  renameProject,
  restoreVersion,
  saveCode,
  sendMessage,
  unpublishProject,
} from "@/serverFunctions/projects";

export const Route = createFileRoute("/projects/$projectId")({
  loader: async ({ params }) => {
    const parsed = /^[0-9a-f-]{36}$/i.test(params.projectId);
    const project = parsed
      ? await getProject({ data: { projectId: params.projectId } })
      : null;
    if (!project) throw notFound();
    return project;
  },
  head: ({ loaderData }) => ({
    meta: loaderData ? [{ title: loaderData.name }] : [],
  }),
  component: ProjectPage,
  notFoundComponent: ProjectNotFound,
});

function ProjectNotFound() {
  return (
    <AppShell>
      <PageHeader
        title="Project not found"
        description="It may have been deleted."
        backLink={<BackLink>Projects</BackLink>}
      />
    </AppShell>
  );
}

type Dialog = "publish" | "rename" | "delete" | null;

function ProjectPage() {
  const project = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const projectId = project.id;
  const [building, setBuilding] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [tab, setTab] = useState("chat");
  const [previewing, setPreviewing] = useState<{
    id: string;
    html: string;
  } | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const started = useRef<string | null>(null);

  const busy = building || isBusy(project.messages);
  const queued = project.messages.find(
    (message) => message.status === "queued",
  );
  const working = project.messages.some(
    (message) => message.status === "working",
  );

  const build = useCallback(async () => {
    setBuilding(true);
    try {
      await buildNext({ data: { projectId } });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      await router.invalidate();
      setBuilding(false);
    }
  }, [projectId, router]);

  // A queued message (the description of a new project) is built on arrival.
  useEffect(() => {
    if (!queued || building || started.current === queued.id) return;
    started.current = queued.id;
    setPreviewing(null);
    void build();
  }, [queued, building, build]);

  // Another tab is building: check back until it is done.
  useEffect(() => {
    if (!working || building) return;
    const timer = setTimeout(() => void router.invalidate(), 3000);
    return () => clearTimeout(timer);
  }, [working, building, router, project]);

  async function send(content: string): Promise<boolean> {
    setBuilding(true);
    try {
      const message = await sendMessage({ data: { projectId, content } });
      started.current = message.id;
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
      setBuilding(false);
      return false;
    }
    setPreviewing(null);
    void build();
    return true;
  }

  async function save(html: string) {
    try {
      await saveCode({ data: { projectId, html } });
      setPreviewing(null);
      await router.invalidate();
      toast.success("Saved as a new version.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function preview(versionId: string) {
    if (versionId === project.currentVersionId) {
      setPreviewing(null);
      return;
    }
    try {
      const version = await getVersionHtml({ data: { projectId, versionId } });
      setPreviewing({ id: versionId, html: version.html });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function restore(versionId: string) {
    setRestoringId(versionId);
    try {
      await restoreVersion({ data: { projectId, versionId } });
      setPreviewing(null);
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRestoringId(null);
    }
  }

  const previewNumber = previewing
    ? project.versions.find((version) => version.id === previewing.id)?.number
    : null;
  const publishedNumber = project.versions.find(
    (version) => version.id === project.publishedVersionId,
  )?.number;

  return (
    <AppShell wide>
      <PageHeader
        backLink={<BackLink>Projects</BackLink>}
        title={project.name}
        description={
          <div
            data-testid="publish-state"
            className="flex flex-wrap items-center gap-2"
          >
            {project.shareUrl ? (
              <>
                <Badge variant="success">Published · v{publishedNumber}</Badge>
                <a
                  data-testid="share-link"
                  href={project.shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-primary hover:underline"
                >
                  {project.shareUrl}
                </a>
                <CopyButton
                  value={project.shareUrl}
                  successMessage="Link copied."
                  size="icon-xs"
                  variant="ghost"
                />
              </>
            ) : (
              <Badge variant="secondary">Draft</Badge>
            )}
          </div>
        }
        actions={
          <>
            <Button onClick={() => setDialog("publish")}>
              <Upload data-icon="inline-start" />
              Publish
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Project actions"
                  />
                }
              >
                <Ellipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setDialog("rename")}>
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDialog("delete")}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
          <TabsList>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="code">Code</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="pt-4">
            <Chat messages={project.messages} building={busy} onSend={send} />
          </TabsContent>
          <TabsContent value="code" className="pt-4">
            <CodeEditor
              key={project.currentVersionId ?? "none"}
              original={project.html ?? ""}
              onSave={save}
            />
          </TabsContent>
          <TabsContent value="versions" className="pt-4">
            <Versions
              versions={project.versions}
              currentVersionId={project.currentVersionId}
              previewingId={previewing?.id ?? null}
              restoringId={restoringId}
              onPreview={(id) => void preview(id)}
              onRestore={(id) => void restore(id)}
            />
          </TabsContent>
        </Tabs>
        <Preview
          html={previewing?.html ?? project.html}
          banner={
            previewing ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <span>Showing v{previewNumber}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPreviewing(null)}
                >
                  Show current
                </Button>
              </div>
            ) : null
          }
        />
      </div>

      {dialog === "publish" && (
        <PublishDialog
          project={project}
          onClose={() => setDialog(null)}
          onPublish={async (versionId) => {
            try {
              await publishProject({ data: { projectId, versionId } });
              await router.invalidate();
            } catch (error) {
              toast.error(errorMessage(error));
              throw error;
            }
          }}
          onUnpublish={async () => {
            try {
              await unpublishProject({ data: { projectId } });
              await router.invalidate();
            } catch (error) {
              toast.error(errorMessage(error));
              throw error;
            }
          }}
        />
      )}
      {dialog === "rename" && (
        <RenameDialog
          name={project.name}
          onClose={() => setDialog(null)}
          onRename={async (name) => {
            await renameProject({ data: { projectId, name } });
            await router.invalidate();
          }}
        />
      )}
      {dialog === "delete" && (
        <DeleteDialog
          onClose={() => setDialog(null)}
          onDelete={async () => {
            await deleteProject({ data: { projectId } });
            await navigate({ to: "/" });
          }}
        />
      )}
    </AppShell>
  );
}

function RenameDialog({
  name: initial,
  onRename,
  onClose,
}: {
  name: string;
  onRename: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    try {
      await onRename(name);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
      setPending(false);
    }
  }

  return (
    <FormDialog
      title="Rename project"
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="rename-project" pending={pending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="rename-project"
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Label htmlFor="rename-name">Name</Label>
        <Input
          id="rename-name"
          value={name}
          maxLength={80}
          required
          onChange={(event) => setName(event.target.value)}
        />
      </form>
    </FormDialog>
  );
}

function DeleteDialog({
  onDelete,
  onClose,
}: {
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <ConfirmDialog
      title="Delete this project?"
      confirmLabel="Delete"
      destructive
      pending={pending}
      onClose={onClose}
      onConfirm={() => {
        setPending(true);
        onDelete().catch((error: unknown) => {
          toast.error(errorMessage(error));
          setPending(false);
        });
      }}
    >
      Its conversation, versions and public link are deleted too.
    </ConfirmDialog>
  );
}
