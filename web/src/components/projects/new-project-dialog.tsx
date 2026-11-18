"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog, fieldClass, primaryButtonClass } from "@/components/ui/app-dialog";

export function NewProjectDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = (await response.json().catch(() => null)) as
        | { project?: { id: string }; error?: { message?: string } }
        | null;

      if (!response.ok || !data?.project) {
        setError(data?.error?.message ?? "Could not create the project.");
        return;
      }

      setOpen(false);
      setName("");
      setDescription("");
      router.push(`/projects/${data.project.id}`);
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" className={primaryButtonClass} onClick={() => setOpen(true)}>
        New project
      </button>
      <Dialog open={open} onClose={close} title="New project">
        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div>
            <label htmlFor="project-name" className="text-sm font-medium text-foreground">
              Name
            </label>
            <input
              id="project-name"
              className={fieldClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="project-description" className="text-sm font-medium text-foreground">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="project-description"
              className={fieldClass}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={loading}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-muted disabled:opacity-60"
            >
              Cancel
            </button>
            <button type="submit" disabled={loading} className={primaryButtonClass}>
              {loading ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
