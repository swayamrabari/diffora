import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ComparisonWorkspace } from "@/components/comparisons/comparison-workspace";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { findComparisonForUser } from "@/lib/queries";
import { toDeprecation, toFinding } from "@/lib/serializers";

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

  const db = getDb();
  const [findings, deprecations] = await Promise.all([
    db.comparisonFinding.findMany({
      where: { comparisonId: comparison.id },
      orderBy: [{ kind: "asc" }, { position: "asc" }],
      take: 10_000,
    }),
    db.comparisonDeprecation.findMany({
      where: { comparisonId: comparison.id },
      orderBy: { position: "asc" },
    }),
  ]);

  return (
    <Suspense fallback={<div className="text-sm text-zinc-500">Loading comparison…</div>}>
      <ComparisonWorkspace
        comparison={{
          id: comparison.id,
          projectId: comparison.projectId,
          status: comparison.status,
          engineVersion: comparison.engineVersion,
          durationMs: comparison.durationMs,
          totalChangelog: comparison.totalChangelog,
          totalBreaking: comparison.totalBreaking,
          totalDeprecations: comparison.totalDeprecations,
          summary: comparison.summary,
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
        findings={findings.map(toFinding)}
        deprecations={deprecations.map(toDeprecation)}
      />
    </Suspense>
  );
}
