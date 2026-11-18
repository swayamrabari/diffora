"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronDownIcon } from "lucide-react";
import { DeleteComparisonButton } from "@/components/comparisons/delete-comparison-button";
import { StructuredDiffView } from "@/components/comparisons/structured-diff-view";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatDate } from "@/lib/format";
import {
  categoryLabels,
  categoryOrder,
  isDeprecatedChange,
  type DiffChangeItem,
} from "@/lib/structured-diff";

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

  const summary = useMemo(() => {
    const byType = { added: 0, removed: 0, modified: 0 };
    const byCategory = new Map<string, number>();
    let deprecated = 0;

    for (const change of changes) {
      if (change.changeType === "added") {
        byType.added += 1;
      } else if (change.changeType === "removed") {
        byType.removed += 1;
      } else {
        byType.modified += 1;
      }
      byCategory.set(change.category, (byCategory.get(change.category) ?? 0) + 1);
      if (isDeprecatedChange(change)) {
        deprecated += 1;
      }
    }

    return {
      total: changes.length,
      byType,
      deprecated,
      byCategory: Array.from(byCategory.entries()).sort(
        ([left], [right]) => categoryOrder.indexOf(left) - categoryOrder.indexOf(right),
      ),
    };
  }, [changes]);

  const cards = [
    { label: "Changes", value: summary.total, hint: "deduplicated" },
    { label: "Added", value: summary.byType.added, hint: "new API surface" },
    { label: "Removed", value: summary.byType.removed, hint: "removed API surface" },
    { label: "Modified", value: summary.byType.modified, hint: "changed details" },
    { label: "Deprecated", value: summary.deprecated, hint: "newly deprecated" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/projects/${comparison.projectId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {comparison.project.name}
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {comparison.baseVersion.label} → {comparison.targetVersion.label}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {comparison.baseVersion.title} → {comparison.targetVersion.title}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
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
      </div>

      {failed ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
          <p className="font-medium">Comparison failed</p>
          <p className="mt-1">
            {comparison.errorMessage ?? "The comparison could not be completed."}
          </p>
        </div>
      ) : null}

      <Collapsible defaultOpen className="rounded-lg border border-border bg-card">
        <CollapsibleTrigger className="group flex w-full items-center gap-3 px-5 py-4 text-left">
          <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
          <span className="font-medium">Summary</span>
          <Badge variant="outline">{summary.total} changes</Badge>
          {summary.deprecated > 0 ? (
            <Badge>{summary.deprecated} deprecated</Badge>
          ) : null}
          <span className="ms-auto text-xs text-muted-foreground">
            {failed ? "failed" : comparison.status}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-5 border-t border-border p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {cards.map((card) => (
                <div key={card.label} className="rounded-md border border-border p-4">
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">{card.value}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{card.hint}</p>
                </div>
              ))}
            </div>

            {summary.byCategory.length > 0 ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  By type
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {summary.byCategory.map(([category, count]) => (
                    <Badge key={category} variant="outline">
                      {categoryLabels[category] ?? category}: {count}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {changes.length > 0 ? (
        <StructuredDiffView changes={changes} />
      ) : (
        <div className="rounded-lg border border-border bg-card px-5 py-16 text-center">
          <p className="text-sm font-medium">No changes recorded</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {failed
              ? "This comparison did not complete."
              : "The two versions appear to be the same, or this comparison was created before structured changes were stored. Re-run it from the project page to refresh it."}
          </p>
        </div>
      )}
    </div>
  );
}
