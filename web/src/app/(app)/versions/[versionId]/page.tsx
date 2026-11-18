import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HeaderBreadcrumb } from "@/components/layout/header-breadcrumb";
import { SpecExplorer } from "@/components/versions/spec-explorer";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { summarizeSpec } from "@/lib/openapi-summary";
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

  const summary = summarizeSpec(version.content);

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
            <h1 className="text-2xl font-semibold tracking-tight">{version.label}</h1>
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
              className={buttonVariants({ variant: "outline" })}
            >
              Open raw
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <div className="inline-flex min-w-0 items-center gap-1.5">
            <span className="text-muted-foreground">File</span>
            <span className="truncate font-medium" title={version.originalFilename}>
              {version.originalFilename}
            </span>
          </div>
          <span className="hidden h-4 w-px bg-border sm:block" />
          <div className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground">Format</span>
            <Badge variant="outline" className="uppercase">
              {version.specFormat}
            </Badge>
          </div>
          <div className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground">OpenAPI</span>
            <Badge variant="outline">{version.openapiVersion}</Badge>
          </div>
          <div className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground">Uploaded</span>
            <span className="font-medium">{formatDate(version.createdAt)}</span>
          </div>
        </div>

        {summary ? (
          <SpecExplorer summary={summary} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>API guide unavailable</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                The stored spec could not be summarised. You can still open or
                copy the raw file.
              </p>
              <a
                href={`/api/versions/${version.id}/raw`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                Open raw
              </a>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
