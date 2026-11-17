import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CopyButton } from "@/components/ui/copy-button";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatBytes, formatDate } from "@/lib/format";
import { findVersionForUser } from "@/lib/queries";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ versionId: string }> };

export default async function VersionPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { versionId } = await params;
  const version = await findVersionForUser(user.id, versionId);
  if (!version) {
    notFound();
  }

  const comparisons = await getDb().comparison.findMany({
    where: {
      project: { userId: user.id },
      OR: [{ baseVersionId: version.id }, { targetVersionId: version.id }],
    },
    orderBy: { createdAt: "desc" },
    include: {
      baseVersion: { select: { id: true, label: true } },
      targetVersion: { select: { id: true, label: true } },
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/projects/${version.projectId}`}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← {version.project.name}
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {version.label}
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{version.title}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton value={version.content} label="Copy spec" />
            <a
              href={`/api/versions/${version.id}/raw`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Open raw
            </a>
          </div>
        </div>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Metadata</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-zinc-500">OpenAPI</dt>
            <dd className="mt-1 text-zinc-900 dark:text-zinc-100">{version.openapiVersion}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Format</dt>
            <dd className="mt-1 uppercase text-zinc-900 dark:text-zinc-100">{version.specFormat}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Size</dt>
            <dd className="mt-1 text-zinc-900 dark:text-zinc-100">{formatBytes(version.fileSize)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Original file</dt>
            <dd className="mt-1 break-all text-zinc-900 dark:text-zinc-100">
              {version.originalFilename}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Uploaded</dt>
            <dd className="mt-1 text-zinc-900 dark:text-zinc-100">{formatDate(version.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Checksum</dt>
            <dd className="mt-1 font-mono text-xs text-zinc-900 dark:text-zinc-100">
              {version.checksum.slice(0, 16)}…
            </dd>
          </div>
        </dl>
        {version.description ? (
          <p className="mt-4 border-t border-zinc-200 pt-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
            {version.description}
          </p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Raw spec</h2>
        </div>
        <pre className="max-h-[70vh] overflow-auto p-5 text-xs leading-6 text-zinc-800 dark:text-zinc-200">
          <code>{version.content}</code>
        </pre>
      </section>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Comparisons involving this version
          </h2>
        </div>

        {comparisons.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              No comparisons yet
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Compare this version with another version in the project.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="px-5 py-3 font-medium">Versions</th>
                  <th className="px-5 py-3 font-medium">Changes</th>
                  <th className="px-5 py-3 font-medium">Breaking</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {comparisons.map((comparison) => (
                  <tr key={comparison.id}>
                    <td className="px-5 py-3">
                      <Link
                        href={`/comparisons/${comparison.id}`}
                        className="text-zinc-900 hover:underline dark:text-zinc-100"
                      >
                        {comparison.baseVersion.label} → {comparison.targetVersion.label}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400">
                      {comparison.totalChangelog}
                    </td>
                    <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400">
                      {comparison.totalBreaking}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={
                          comparison.status === "completed"
                            ? "rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : "rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
                        }
                      >
                        {comparison.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400">
                      {formatDate(comparison.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
