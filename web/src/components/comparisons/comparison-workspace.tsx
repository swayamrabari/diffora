"use client";

import Link from "next/link";
import { DeleteComparisonButton } from "@/components/comparisons/delete-comparison-button";
import { StructuredDiffView } from "@/components/comparisons/structured-diff-view";
import { Brand } from "@/components/layout/brand";
import { Badge } from "@/components/ui/badge";
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
    <div className="fixed inset-0 z-20 flex flex-col overflow-hidden bg-card">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
        <Brand />
        <span className="hidden text-muted-foreground sm:inline">/</span>
        <Link
          href={`/projects/${comparison.projectId}`}
          className="hidden min-w-0 truncate text-sm text-muted-foreground hover:text-foreground sm:inline"
        >
          {comparison.project.name}
        </Link>
        <span className="hidden text-muted-foreground sm:inline">/</span>
        <div
          className="min-w-0 truncate text-sm font-medium"
          title={`${comparison.baseVersion.title} → ${comparison.targetVersion.title}`}
        >
          {comparison.baseVersion.label}{" "}
          <span className="text-muted-foreground">→</span>{" "}
          {comparison.targetVersion.label}
        </div>
        {failed ? <Badge variant="destructive">failed</Badge> : null}

        <div className="ms-auto flex shrink-0 items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {changes.length} changes
          </span>
          <a
            href={`/api/comparisons/${comparison.id}/export`}
            className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Export
          </a>
          <DeleteComparisonButton
            comparisonId={comparison.id}
            projectId={comparison.projectId}
          />
        </div>
      </header>

      {changes.length > 0 ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <StructuredDiffView changes={changes} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
          <div>
            <p className="text-sm font-medium">
              {failed ? "Comparison failed" : "No changes recorded"}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {failed
                ? comparison.errorMessage ?? "The comparison could not be completed."
                : "The two versions appear to be the same, or this comparison was created before structured changes were stored. Re-run it from the project page to refresh it."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
