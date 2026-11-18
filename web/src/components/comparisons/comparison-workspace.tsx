"use client";

import Link from "next/link";
import { DeleteComparisonButton } from "@/components/comparisons/delete-comparison-button";
import { StructuredDiffView } from "@/components/comparisons/structured-diff-view";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { DiffChangeItem } from "@/lib/structured-diff";

type ComparisonInfo = {
  id: string;
  projectId: string;
  status: string;
  engineVersion: string;
  durationMs: number;
  totalChanges: number;
  errorMessage: string | null;
  createdAt: string;
  project: { id: string; name: string };
  baseVersion: { id: string; label: string; title: string };
  targetVersion: { id: string; label: string; title: string };
};

type ComparisonWorkspaceProps = {
  comparison: ComparisonInfo;
  changes: DiffChangeItem[];
};

export function ComparisonWorkspace({ comparison, changes }: ComparisonWorkspaceProps) {
  const failed = comparison.status === "failed";

  return (
    <div className="fixed inset-x-0 top-14 bottom-0 z-20 flex flex-col overflow-hidden bg-zinc-50 dark:bg-black">
      <header className="shrink-0 border-b border-border bg-card px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/projects/${comparison.projectId}`}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ← {comparison.project.name}
            </Link>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight">
                {comparison.baseVersion.label} → {comparison.targetVersion.label}
              </h1>
              <Badge variant="outline">{changes.length} changes</Badge>
              {failed ? <Badge variant="destructive">failed</Badge> : null}
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {comparison.baseVersion.title} → {comparison.targetVersion.title} ·{" "}
              {formatDate(comparison.createdAt)} · engine {comparison.engineVersion} ·{" "}
              {comparison.durationMs} ms
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/comparisons/${comparison.id}/export`}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
            >
              Export JSON
            </a>
            <DeleteComparisonButton
              comparisonId={comparison.id}
              projectId={comparison.projectId}
            />
          </div>
        </div>

        {failed ? (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span className="font-medium">Comparison failed.</span>{" "}
            {comparison.errorMessage ?? "The comparison could not be completed."}
          </div>
        ) : null}
      </header>

      {changes.length > 0 ? (
        <div className="flex min-h-0 flex-1 overflow-hidden border-t border-border bg-card">
          <StructuredDiffView changes={changes} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center border-t border-border bg-card px-6 text-center">
          <div>
            <p className="text-sm font-medium">No changes recorded</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {failed
                ? "This comparison did not complete."
                : "The two versions appear to be the same, or this comparison was created before structured changes were stored. Re-run it from the project page to refresh it."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
