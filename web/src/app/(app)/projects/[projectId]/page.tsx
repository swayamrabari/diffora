import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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

      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            {project.description ? (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {project.description}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              Updated {formatDate(project.updatedAt)}
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

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">Versions</h2>
            <Badge variant="outline">{versions.length}</Badge>
          </div>

          {versions.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No versions yet. Upload a YAML or JSON spec to start.
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Label</th>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">OpenAPI</th>
                    <th className="px-4 py-3 font-medium">Format</th>
                    <th className="px-4 py-3 font-medium">Size</th>
                    <th className="px-4 py-3 font-medium">Uploaded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {versions.map((version) => (
                    <tr key={version.id} className="transition-colors hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/versions/${version.id}`}
                          className="font-medium hover:underline"
                        >
                          {version.label}
                        </Link>
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">
                        {version.title}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{version.openapiVersion}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="uppercase">
                          {version.specFormat}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatBytes(version.fileSize)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(version.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">Comparisons</h2>
            <Badge variant="outline">{comparisons.length}</Badge>
          </div>

          {comparisons.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No comparisons yet. Upload at least two versions, then compare them.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {comparisons.map((comparison) => {
                const summary = summarizeChanges(comparison.changes);
                return (
                  <Card key={comparison.id} size="sm">
                    <CardHeader>
                      <CardTitle className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 truncate">
                          {comparison.baseVersion.label} → {comparison.targetVersion.label}
                        </span>
                        <Badge
                          variant={
                            comparison.status === "completed" ? "secondary" : "destructive"
                          }
                        >
                          {comparison.status}
                        </Badge>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(comparison.createdAt)} · {comparison.totalChanges} changes
                      </p>
                    </CardHeader>

                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        >
                          Added {summary.added}
                        </Badge>
                        <Badge variant="outline" className="border-destructive/20 bg-destructive/10 text-destructive">
                          Removed {summary.removed}
                        </Badge>
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
