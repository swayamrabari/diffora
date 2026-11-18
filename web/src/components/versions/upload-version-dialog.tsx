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
      <Button type="button" variant="outline" onClick={openDialog}>
        Upload version
      </Button>
      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload version</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSubmit}>
          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="version-file">Spec file</Label>
            <Input
              id="version-file"
              type="file"
              accept=".yaml,.yml,.json"
              onChange={onFileChange}
              required
              className="file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
            />
            <p className="text-xs text-muted-foreground">YAML or JSON, up to 2 MB.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="version-label">Label</Label>
            <Input
              id="version-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              required
              maxLength={50}
              placeholder="v1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="version-description">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="version-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Uploading…" : "Upload"}
            </Button>
          </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
