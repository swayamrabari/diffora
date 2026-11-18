"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type VersionOption = {
  id: string;
  label: string;
  specFormat: string;
};

type CompareDialogProps = {
  projectId: string;
  versions: VersionOption[];
};

export function CompareDialog({ projectId, versions }: CompareDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [baseVersionId, setBaseVersionId] = useState("");
  const [targetVersionId, setTargetVersionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const base = versions.find((version) => version.id === baseVersionId);
  const target = versions.find((version) => version.id === targetVersionId);
  const formatMismatch =
    base !== undefined &&
    target !== undefined &&
    base.specFormat !== target.specFormat;
  const disabled =
    !baseVersionId ||
    !targetVersionId ||
    baseVersionId === targetVersionId ||
    formatMismatch ||
    loading;

  function openDialog() {
    setBaseVersionId("");
    setTargetVersionId("");
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
    if (disabled) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/comparisons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseVersionId, targetVersionId }),
      });
      const data = (await response.json().catch(() => null)) as
        | {
            comparison?: { id: string };
            error?: { message?: string; details?: { comparisonId?: string } };
          }
        | null;

      if (!response.ok || !data?.comparison) {
        const failedId = data?.error?.details?.comparisonId;
        if (failedId) {
          router.push(`/comparisons/${failedId}`);
          router.refresh();
          return;
        }
        setError(data?.error?.message ?? "Could not create the comparison.");
        return;
      }

      setOpen(false);
      router.push(`/comparisons/${data.comparison.id}`);
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={openDialog}
        disabled={versions.length < 2}
        title={versions.length < 2 ? "Upload at least two versions first." : undefined}
      >
        Compare
      </Button>

      <Dialog open={open} onClose={close} title="Compare versions">
        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div>
            <label htmlFor="base-version" className="text-sm font-medium text-foreground">
              Base version
            </label>
            <Select
              value={baseVersionId || null}
              onValueChange={(value) =>
                setBaseVersionId(value ? String(value) : "")
              }
              items={versions
                .filter((version) => version.id !== targetVersionId)
                .map((version) => ({
                  value: version.id,
                  label: `${version.label} (${version.specFormat})`,
                }))}
            >
              <SelectTrigger id="base-version" className="mt-1 w-full">
                <SelectValue placeholder="Choose a version" />
              </SelectTrigger>
              <SelectContent align="start">
                {versions
                  .filter((version) => version.id !== targetVersionId)
                  .map((version) => (
                    <SelectItem key={version.id} value={version.id}>
                      {version.label} ({version.specFormat})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label htmlFor="target-version" className="text-sm font-medium text-foreground">
              Target version
            </label>
            <Select
              value={targetVersionId || null}
              onValueChange={(value) =>
                setTargetVersionId(value ? String(value) : "")
              }
              items={versions
                .filter((version) => version.id !== baseVersionId)
                .map((version) => ({
                  value: version.id,
                  label: `${version.label} (${version.specFormat})`,
                }))}
            >
              <SelectTrigger id="target-version" className="mt-1 w-full">
                <SelectValue placeholder="Choose a version" />
              </SelectTrigger>
              <SelectContent align="start">
                {versions
                  .filter((version) => version.id !== baseVersionId)
                  .map((version) => (
                    <SelectItem key={version.id} value={version.id}>
                      {version.label} ({version.specFormat})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {formatMismatch ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              Both versions must use the same format: YAML or JSON.
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={disabled}>
              {loading ? "Comparing…" : "Run comparison"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
