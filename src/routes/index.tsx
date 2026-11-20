import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { FormDialog } from "@/client/components/FormDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { Textarea } from "@/client/components/ui/textarea";
import { errorMessage, formatTime } from "@/client/lib/format";
import { createProject, getProjects } from "@/serverFunctions/projects";

export const Route = createFileRoute("/")({
  loader: () => getProjects(),
  head: () => ({ meta: [{ title: "Chat App Builder" }] }),
  component: Home,
});

function Home() {
  const projects = Route.useLoaderData();
  const [creating, setCreating] = useState(false);
  const newButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus data-icon="inline-start" />
      New project
    </Button>
  );

  return (
    <AppShell>
      <PageHeader
        title="Projects"
        actions={projects.length > 0 ? newButton : null}
      />
      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Describe an app and it will be built here."
          action={newButton}
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id} data-testid="project-row">
                  <TableCell className="font-medium">
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: project.id }}
                      className="hover:underline"
                    >
                      {project.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {project.published ? (
                      <Badge variant="success">Published</Badge>
                    ) : (
                      <Badge variant="secondary">Draft</Badge>
                    )}
                  </TableCell>
                  <TableCell
                    className="text-right text-muted-foreground"
                    suppressHydrationWarning
                  >
                    {formatTime(project.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
      {creating && <NewProjectDialog onClose={() => setCreating(false)} />}
    </AppShell>
  );
}

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const project = await createProject({ data: { name, description } });
      await navigate({
        to: "/projects/$projectId",
        params: { projectId: project.id },
      });
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  return (
    <FormDialog
      title="New project"
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="new-project" pending={pending}>
            Create
          </Button>
        </>
      }
    >
      <form
        id="new-project"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="project-name">Name</Label>
          <Input
            id="project-name"
            value={name}
            maxLength={80}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="project-description">Describe the app</Label>
          <Textarea
            id="project-description"
            rows={5}
            value={description}
            maxLength={4000}
            required
            placeholder="A habit tracker with a weekly grid and a streak count"
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </form>
    </FormDialog>
  );
}
