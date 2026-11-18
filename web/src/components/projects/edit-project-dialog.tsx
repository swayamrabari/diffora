"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type EditProjectDialogProps = {
  project: {
    id: string;
    name: string;
    description: string | null;
  };
};

export function EditProjectDialog({ project }: EditProjectDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function openDialog() {
    setName(project.name);
    setDescription(project.description ?? "");
    setError(null);
    setOpen(true);
  }

  function close() {
    if (loading) {
      return;
    }
    setOpen(false);
    setError(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;

      if (!response.ok) {
        setError(data?.error?.message ?? "Could not update the project.");
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={openDialog}>
        Edit
      </Button>
      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSubmit}>
          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="edit-project-name">Name</Label>
            <Input
              id="edit-project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-project-description">Description</Label>
            <Textarea
              id="edit-project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : "Save changes"}
            </Button>
          </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
