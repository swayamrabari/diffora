import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowUpRight, GitCompareArrows } from "lucide-react";
import { HeaderBreadcrumb } from "@/components/layout/header-breadcrumb";
import { CopyButton } from "@/components/ui/copy-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

  const metadata = [
    { label: "OpenAPI", value: version.openapiVersion },
    { label: "Format", value: version.specFormat.toUpperCase() },
    { label: "Size", value: formatBytes(version.fileSize) },
    { label: "Original file", value: version.originalFilename },
    { label: "Uploaded", value: formatDate(version.createdAt) },
    { label: "Checksum", value: `${version.checksum.slice(0, 16)}…`, mono: true },
  ];

  return (
    <>
      <HeaderBreadcrumb>
        <span>/</span>
        <Link
          href={`/projects/${version.projectId}`}
          className="truncate hover:text-foreground"
        >
          {version.project.name}
        </Link>
        <span>/</span>
        <span className="truncate">{version.label}</span>
      </HeaderBreadcrumb>

      <div className="space-y-10">
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-xs sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.07] via-transparent to-transparent" />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-background/60">
                  API version
                </Badge>
                <Badge variant="secondary" className="uppercase">
                  {version.specFormat}
                </Badge>
                <Badge variant="outline">{version.openapiVersion}</Badge>
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight">
                {version.label}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">{version.title}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                Uploaded {formatDate(version.createdAt)} · {formatBytes(version.fileSize)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <CopyButton value={version.content} label="Copy spec" />
              <a
                href={`/api/versions/${version.id}/raw`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                Open raw
              </a>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
              <CardDescription>Identity and upload details for this spec.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-2">
                {metadata.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg border border-border/70 bg-muted/20 p-3"
                  >
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {item.label}
                    </dt>
                    <dd
                      className={`mt-1 break-all text-sm font-medium ${
                        item.mono ? "font-mono text-xs" : ""
                      }`}
                    >
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
              {version.description ? (
                <p className="rounded-lg border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
                  {version.description}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Raw spec</CardTitle>
              <CardDescription>
                The exact uploaded content. Copy it or open it in a new tab.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <pre className="max-h-[52vh] overflow-auto border-t border-border bg-muted/20 p-5 font-mono text-xs leading-6">
                <code>{version.content}</code>
              </pre>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">
                  Comparisons involving this version
                </h2>
                <Badge variant="outline">{comparisons.length}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Open a saved diff to review the changes.
              </p>
            </div>
          </div>

          {comparisons.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
                  <GitCompareArrows className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">No comparisons yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Compare this version with another version in the project.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {comparisons.map((comparison) => (
                <Link
                  key={comparison.id}
                  href={`/comparisons/${comparison.id}`}
                  className="group block"
                >
                  <Card
                    size="sm"
                    className="transition-all group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-foreground/20"
                  >
                    <CardContent className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {comparison.baseVersion.label} → {comparison.targetVersion.label}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(comparison.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{comparison.totalChanges} changes</Badge>
                        <Badge
                          variant={
                            comparison.status === "completed" ? "secondary" : "destructive"
                          }
                        >
                          {comparison.status}
                        </Badge>
                        <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
