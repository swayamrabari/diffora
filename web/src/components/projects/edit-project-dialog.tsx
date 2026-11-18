"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog, fieldClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/app-dialog";

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
      <button type="button" className={secondaryButtonClass} onClick={openDialog}>
        Edit
      </button>
      <Dialog open={open} onClose={close} title="Edit project">
        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <div>
            <label htmlFor="edit-project-name" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Name
            </label>
            <input
              id="edit-project-name"
              className={fieldClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
            />
          </div>

          <div>
            <label htmlFor="edit-project-description" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Description
            </label>
            <textarea
              id="edit-project-description"
              className={fieldClass}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} disabled={loading} className={secondaryButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={primaryButtonClass}>
              {loading ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
