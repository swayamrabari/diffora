"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Dialog,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/app-dialog";
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
      <button
        type="button"
        onClick={openDialog}
        disabled={versions.length < 2}
        title={versions.length < 2 ? "Upload at least two versions first." : undefined}
        className={secondaryButtonClass}
      >
        Compare
      </button>

      <Dialog open={open} onClose={close} title="Compare versions">
        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <div>
            <label htmlFor="base-version" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
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
            <label htmlFor="target-version" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
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
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Both versions must use the same format: YAML or JSON.
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} disabled={loading} className={secondaryButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={disabled} className={primaryButtonClass}>
              {loading ? "Comparing…" : "Run comparison"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
