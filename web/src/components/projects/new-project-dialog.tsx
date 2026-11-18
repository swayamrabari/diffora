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
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <div>
            <label htmlFor="project-name" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
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
            <label htmlFor="project-description" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Description <span className="font-normal text-zinc-500">(optional)</span>
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
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
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
