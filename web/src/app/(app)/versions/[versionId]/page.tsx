import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HeaderBreadcrumb } from "@/components/layout/header-breadcrumb";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
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

  const metadata = [
    { label: "OpenAPI", value: version.openapiVersion },
    { label: "Format", value: version.specFormat.toUpperCase() },
    { label: "Size", value: formatBytes(version.fileSize) },
    { label: "Original file", value: version.originalFilename },
    { label: "Uploaded", value: formatDate(version.createdAt) },
    { label: "Checksum", value: `${version.checksum.slice(0, 16)}…` },
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

      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{version.label}</h1>
              <Badge variant="outline" className="uppercase">
                {version.specFormat}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{version.title}</p>
            {version.description ? (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {version.description}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <CopyButton value={version.content} label="Copy spec" />
            <a
              href={`/api/versions/${version.id}/raw`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-muted"
            >
              Open raw
            </a>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {metadata.map((item) => (
                <div key={item.label}>
                  <dt className="text-muted-foreground">{item.label}</dt>
                  <dd className="mt-1 break-all font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spec</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <pre className="max-h-[70vh] overflow-auto border-t border-border bg-muted/30 p-5 font-mono text-xs leading-6">
              <code>{version.content}</code>
            </pre>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
