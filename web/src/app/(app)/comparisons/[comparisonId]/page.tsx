import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ComparisonWorkspace } from "@/components/comparisons/comparison-workspace";
import { getCurrentUser } from "@/lib/auth";
import { findComparisonForUser } from "@/lib/queries";
import type { DiffChangeItem } from "@/lib/structured-diff";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ comparisonId: string }> };

export default async function ComparisonPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { comparisonId } = await params;
  const comparison = await findComparisonForUser(user.id, comparisonId);
  if (!comparison) {
    notFound();
  }

  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading comparison…</div>}>
      <ComparisonWorkspace
        comparison={{
          id: comparison.id,
          projectId: comparison.projectId,
          status: comparison.status,
          engineVersion: comparison.engineVersion,
          durationMs: comparison.durationMs,
          totalChanges: comparison.totalChanges,
          errorMessage: comparison.errorMessage,
          createdAt: comparison.createdAt.toISOString(),
          project: comparison.project,
          baseVersion: {
            id: comparison.baseVersion.id,
            label: comparison.baseVersion.label,
            title: comparison.baseVersion.title,
          },
          targetVersion: {
            id: comparison.targetVersion.id,
            label: comparison.targetVersion.label,
            title: comparison.targetVersion.title,
          },
        }}
        changes={comparison.changes as DiffChangeItem[]}
      />
    </Suspense>
  );
}
