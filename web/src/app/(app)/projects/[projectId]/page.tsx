import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CompareDialog } from "@/components/comparisons/compare-dialog";
import { DeleteComparisonButton } from "@/components/comparisons/delete-comparison-button";
import { HeaderBreadcrumb } from "@/components/layout/header-breadcrumb";
import { DeleteProjectButton } from "@/components/projects/delete-project-button";
import { EditProjectDialog } from "@/components/projects/edit-project-dialog";
import { UploadVersionDialog } from "@/components/versions/upload-version-dialog";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatBytes, formatDate } from "@/lib/format";
import { findProjectForUser } from "@/lib/queries";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ projectId: string }> };

type StoredChange = {
  changeType?: string;
  field?: string | null;
  newValue?: unknown;
};

function summarizeChanges(value: unknown) {
  const changes = Array.isArray(value) ? (value as StoredChange[]) : [];
  let added = 0;
  let removed = 0;
  let modified = 0;
  let deprecated = 0;

  for (const change of changes) {
    if (change.changeType === "added") {
      added += 1;
    } else if (change.changeType === "removed") {
      removed += 1;
    } else {
      modified += 1;
    }
    if (change.field === "deprecated" && change.newValue === true) {
      deprecated += 1;
    }
  }

  return { added, removed, modified, deprecated };
}

function statusClass(status: string): string {
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300";
  }
  return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300";
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
        <div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {project.name}
            </h1>
            {project.description ? (
              <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
                {project.description}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-zinc-500">
              Created {formatDate(project.createdAt)} · Updated {formatDate(project.updatedAt)}
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
      </div>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Versions</h2>
          <span className="text-xs text-zinc-500">{versions.length}</span>
        </div>

        {versions.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              No versions yet
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Upload a YAML or JSON OpenAPI spec to start.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="px-5 py-3 font-medium">Label</th>
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">OpenAPI</th>
                  <th className="px-5 py-3 font-medium">Format</th>
                  <th className="px-5 py-3 font-medium">Size</th>
                  <th className="px-5 py-3 font-medium">Uploaded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {versions.map((version) => (
                  <tr key={version.id}>
                    <td className="px-5 py-3">
                      <Link
                        href={`/versions/${version.id}`}
                        className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                      >
                        {version.label}
                      </Link>
                    </td>
                    <td className="max-w-xs truncate px-5 py-3 text-zinc-600 dark:text-zinc-400">
                      {version.title}
                    </td>
                    <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400">
                      {version.openapiVersion}
                    </td>
                    <td className="px-5 py-3 uppercase text-zinc-600 dark:text-zinc-400">
                      {version.specFormat}
                    </td>
                    <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400">
                      {formatBytes(version.fileSize)}
                    </td>
                    <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400">
                      {formatDate(version.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Comparisons
          </h2>
          <span className="text-xs text-zinc-500">{comparisons.length}</span>
        </div>

        {comparisons.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white px-5 py-12 text-center dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              No comparisons yet
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Upload at least two versions, then compare them.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {comparisons.map((comparison) => {
              const summary = summarizeChanges(comparison.changes);
              return (
                <article
                  key={comparison.id}
                  className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                          {comparison.baseVersion.label} → {comparison.targetVersion.label}
                        </h3>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClass(comparison.status)}`}
                        >
                          {comparison.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {formatDate(comparison.createdAt)} · {comparison.totalChanges} changes
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      Added {summary.added}
                    </span>
                    <span className="rounded-full bg-red-50 px-2 py-1 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                      Removed {summary.removed}
                    </span>
                    <span className="rounded-full bg-sky-50 px-2 py-1 font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                      Modified {summary.modified}
                    </span>
                    {summary.deprecated > 0 ? (
                      <span className="rounded-full bg-violet-50 px-2 py-1 font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                        Deprecated {summary.deprecated}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                    <a
                      href={`/api/comparisons/${comparison.id}/export`}
                      className="inline-flex h-8 items-center rounded-md border border-zinc-300 px-2.5 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      Export
                    </a>
                    <DeleteComparisonButton
                      comparisonId={comparison.id}
                      projectId={project.id}
                    />
                    <Link
                      href={`/comparisons/${comparison.id}`}
                      className="inline-flex h-8 items-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      View changes
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      </div>
    </>
  );
}
