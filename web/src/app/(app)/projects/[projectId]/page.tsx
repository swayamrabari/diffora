import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowUpRight,
  FileCode2,
  GitCompareArrows,
  type LucideIcon,
} from "lucide-react";
import { CompareDialog } from "@/components/comparisons/compare-dialog";
import { DeleteComparisonButton } from "@/components/comparisons/delete-comparison-button";
import { HeaderBreadcrumb } from "@/components/layout/header-breadcrumb";
import { DeleteProjectButton } from "@/components/projects/delete-project-button";
import { EditProjectDialog } from "@/components/projects/edit-project-dialog";
import { UploadVersionDialog } from "@/components/versions/upload-version-dialog";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatBytes, formatDate } from "@/lib/format";
import { findProjectForUser } from "@/lib/queries";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ projectId: string }> };

type StoredChange = {
  changeType?: string;
};

function summarizeChanges(value: unknown) {
  const changes = Array.isArray(value) ? (value as StoredChange[]) : [];
  let added = 0;
  let removed = 0;
  let modified = 0;

  for (const change of changes) {
    if (change.changeType === "added") {
      added += 1;
    } else if (change.changeType === "removed") {
      removed += 1;
    } else {
      modified += 1;
    }
  }

  return { added, removed, modified };
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function ProjectPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { projectId } = await params;
  const project = await findProjectForUser(user.id, projectId);
  if (!project) {
    notFound();
  }

  const [versions, comparisons] = await Promise.all([
    getDb().apiVersion.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
    }),
    getDb().comparison.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      include: {
        baseVersion: { select: { id: true, label: true } },
        targetVersion: { select: { id: true, label: true } },
      },
    }),
  ]);

  return (
    <>
      <HeaderBreadcrumb>
        <span>/</span>
        <span className="truncate">{project.name}</span>
      </HeaderBreadcrumb>

      <div className="space-y-10">
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-xs sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.07] via-transparent to-transparent" />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-background/60">
                  Project
                </Badge>
                <Badge variant="secondary">{versions.length} versions</Badge>
                <Badge variant="outline">{comparisons.length} comparisons</Badge>
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight">
                {project.name}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                {project.description || "No description yet."}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Created {formatDate(project.createdAt)} · Updated{" "}
                {formatDate(project.updatedAt)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <EditProjectDialog
                project={{
                  id: project.id,
                  name: project.name,
                  description: project.description,
                }}
              />
              <UploadVersionDialog projectId={project.id} />
              <CompareDialog
                projectId={project.id}
                versions={versions.map((version) => ({
                  id: version.id,
                  label: version.label,
                  specFormat: version.specFormat,
                }))}
              />
              <DeleteProjectButton projectId={project.id} projectName={project.name} />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">Versions</h2>
                <Badge variant="outline">{versions.length}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Uploaded OpenAPI specs in this project.
              </p>
            </div>
          </div>

          {versions.length === 0 ? (
            <EmptyState
              icon={FileCode2}
              title="No versions yet"
              description="Upload a YAML or JSON OpenAPI spec to start."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {versions.map((version) => (
                <Link
                  key={version.id}
                  href={`/versions/${version.id}`}
                  className="group block h-full"
                >
                  <Card
                    size="sm"
                    className="h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-foreground/20"
                  >
                    <CardHeader>
                      <CardTitle className="flex items-start justify-between gap-3">
                        <span className="min-w-0 truncate">{version.label}</span>
                        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                      </CardTitle>
                      <CardDescription className="truncate">
                        {version.title}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{version.openapiVersion}</Badge>
                      <Badge variant="outline" className="uppercase">
                        {version.specFormat}
                      </Badge>
                      <span>{formatBytes(version.fileSize)}</span>
                      <span className="text-border">·</span>
                      <span>{formatDate(version.createdAt)}</span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">Comparisons</h2>
                <Badge variant="outline">{comparisons.length}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Saved diffs between two versions.
              </p>
            </div>
          </div>

          {comparisons.length === 0 ? (
            <EmptyState
              icon={GitCompareArrows}
              title="No comparisons yet"
              description="Upload at least two versions, then compare them."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {comparisons.map((comparison) => {
                const summary = summarizeChanges(comparison.changes);
                return (
                  <Card key={comparison.id} size="sm">
                    <CardHeader>
                      <CardTitle className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 truncate">
                          {comparison.baseVersion.label} →{" "}
                          {comparison.targetVersion.label}
                        </span>
                        <Badge
                          variant={
                            comparison.status === "completed" ? "secondary" : "destructive"
                          }
                        >
                          {comparison.status}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        {formatDate(comparison.createdAt)} · {comparison.totalChanges} changes
                      </CardDescription>
                    </CardHeader>

                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        >
                          Added {summary.added}
                        </Badge>
                        <Badge variant="destructive">Removed {summary.removed}</Badge>
                        <Badge
                          variant="outline"
                          className="border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                        >
                          Modified {summary.modified}
                        </Badge>
                      </div>
                    </CardContent>

                    <CardFooter className="justify-end gap-2 border-t">
                      <a
                        href={`/api/comparisons/${comparison.id}/export`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Export
                      </a>
                      <DeleteComparisonButton
                        comparisonId={comparison.id}
                        projectId={project.id}
                      />
                      <Link
                        href={`/comparisons/${comparison.id}`}
                        className={buttonVariants({ size: "sm" })}
                      >
                        View changes
                      </Link>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
