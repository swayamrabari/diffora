"use client";

import { StructuredDiffView } from "@/components/comparisons/structured-diff-view";
import type { DiffChangeItem } from "@/lib/structured-diff";

type ComparisonWorkspaceProps = {
  status: string;
  errorMessage: string | null;
  changes: DiffChangeItem[];
};

export function ComparisonWorkspace({
  status,
  errorMessage,
  changes,
}: ComparisonWorkspaceProps) {
  const failed = status === "failed";

  return (
    <div className="fixed inset-x-0 top-12 bottom-0 z-20 flex flex-col overflow-hidden bg-card">
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
                ? errorMessage ?? "The comparison could not be completed."
                : "The two versions appear to be the same, or this comparison was created before structured changes were stored. Re-run it from the project page to refresh it."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
