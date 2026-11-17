"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog, fieldClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/dialog";

type UploadVersionDialogProps = {
  projectId: string;
};

export function UploadVersionDialog({ projectId }: UploadVersionDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function openDialog() {
    setFile(null);
    setLabel("");
    setDescription("");
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

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    if (selected && !label) {
      setLabel(selected.name.replace(/\.(ya?ml|json)$/i, "").slice(0, 50));
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a YAML or JSON file.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("label", label);
      formData.append("description", description);

      const response = await fetch(`/api/projects/${projectId}/versions`, {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;

      if (!response.ok) {
        setError(data?.error?.message ?? "Could not upload the version.");
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
        Upload version
      </button>
      <Dialog open={open} onClose={close} title="Upload version">
        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <div>
            <label htmlFor="version-file" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Spec file
            </label>
            <input
              id="version-file"
              type="file"
              accept=".yaml,.yml,.json"
              onChange={onFileChange}
              required
              className="mt-1 block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-900 hover:file:bg-zinc-200 dark:text-zinc-300 dark:file:bg-zinc-800 dark:file:text-zinc-100"
            />
            <p className="mt-1 text-xs text-zinc-500">YAML or JSON, up to 2 MB.</p>
          </div>

          <div>
            <label htmlFor="version-label" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Label
            </label>
            <input
              id="version-label"
              className={fieldClass}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              required
              maxLength={50}
              placeholder="v1"
            />
          </div>

          <div>
            <label htmlFor="version-description" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Description <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <textarea
              id="version-description"
              className={fieldClass}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} disabled={loading} className={secondaryButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={primaryButtonClass}>
              {loading ? "Uploading…" : "Upload"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
