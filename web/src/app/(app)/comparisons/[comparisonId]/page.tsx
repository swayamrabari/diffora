import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ComparisonWorkspace } from "@/components/comparisons/comparison-workspace";
import { HeaderBreadcrumb } from "@/components/layout/header-breadcrumb";
import { Spinner } from "@/components/ui/spinner";
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
    <>
      <HeaderBreadcrumb>
        <span>/</span>
        <Link
          href={`/projects/${comparison.projectId}`}
          className="truncate hover:text-foreground"
        >
          {comparison.project.name}
        </Link>
        <span>/</span>
        <span className="min-w-0 truncate">
          {comparison.baseVersion.label} → {comparison.targetVersion.label}
        </span>
      </HeaderBreadcrumb>

      <Suspense
        fallback={
          <div className="fixed inset-x-0 top-12 bottom-0 z-20 flex items-center justify-center bg-background">
            <Spinner className="size-6 text-muted-foreground" />
          </div>
        }
      >
        <ComparisonWorkspace
          status={comparison.status}
          errorMessage={comparison.errorMessage}
          changes={comparison.changes as DiffChangeItem[]}
        />
      </Suspense>
    </>
  );
}
