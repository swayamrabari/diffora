import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { errorResponse, isJsonRequest, isSameOrigin, ok, readJson } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import {
  ComparisonServiceError,
  diffSpecs,
} from "@/lib/comparison-client";
import { toStoredChanges } from "@/lib/comparison-store";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { findProjectForUser } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  baseVersionId: z.string().uuid(),
  targetVersionId: z.string().uuid(),
});

type RouteContext = { params: Promise<{ projectId: string }> };

type VersionRow = {
  id: string;
  label: string;
  title: string;
  specFormat: string;
  content: string;
};

function comparisonSummary(
  comparison: {
    id: string;
    projectId: string;
    status: string;
    engineVersion: string;
    durationMs: number;
    totalChanges: number;
    createdAt: Date;
  },
  base: VersionRow,
  target: VersionRow,
) {
  return {
    id: comparison.id,
    projectId: comparison.projectId,
    status: comparison.status,
    engineVersion: comparison.engineVersion,
    durationMs: comparison.durationMs,
    totalChanges: comparison.totalChanges,
    createdAt: comparison.createdAt,
    baseVersion: { id: base.id, label: base.label, title: base.title },
    targetVersion: { id: target.id, label: target.label, title: target.title },
  };
}

async function createFailedComparison(
  projectId: string,
  base: VersionRow,
  target: VersionRow,
  code: string,
) {
  return getDb().comparison.create({
    data: {
      projectId,
      baseVersionId: base.id,
      targetVersionId: target.id,
      status: "failed",
      engineVersion: "unknown",
      durationMs: 0,
      errorMessage: code,
    },
  });
}

export async function POST(request: Request, context: RouteContext) {
  if (!isJsonRequest(request)) {
    return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.");
  }
  if (!isSameOrigin(request)) {
    return errorResponse(403, "INVALID_ORIGIN", "The request origin is not allowed.");
  }

  const user = await getCurrentUser();
  if (!user) {
    return errorResponse(401, "UNAUTHORIZED", "You are not signed in.");
  }

  const { projectId } = await context.params;
  const project = await findProjectForUser(user.id, projectId);
  if (!project) {
    return errorResponse(404, "NOT_FOUND", "Project not found.");
  }

  const body = await readJson<unknown>(request);
  if (body === null) {
    return errorResponse(400, "BAD_REQUEST", "The request body is not valid JSON.");
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "BAD_REQUEST", "baseVersionId and targetVersionId are required.");
  }

  if (parsed.data.baseVersionId === parsed.data.targetVersionId) {
    return errorResponse(400, "SAME_VERSION", "Choose two different versions.");
  }

  const versions = (await getDb().apiVersion.findMany({
    where: {
      projectId: project.id,
      id: { in: [parsed.data.baseVersionId, parsed.data.targetVersionId] },
    },
    select: {
      id: true,
      label: true,
      title: true,
      specFormat: true,
      content: true,
    },
  })) as VersionRow[];

  const base = versions.find((version) => version.id === parsed.data.baseVersionId);
  const target = versions.find((version) => version.id === parsed.data.targetVersionId);

  if (!base || !target) {
    return errorResponse(400, "VERSION_NOT_IN_PROJECT", "Both versions must belong to this project.");
  }
  if (base.specFormat !== target.specFormat) {
    return errorResponse(
      400,
      "FORMAT_MISMATCH",
      "Both versions must use the same format: yaml or json.",
    );
  }
  const format =
    base.specFormat === "yaml" ? "yaml" : base.specFormat === "json" ? "json" : null;
  if (!format) {
    return errorResponse(400, "FORMAT_MISMATCH", "Unsupported spec format.");
  }

  let diff;
  try {
    diff = await diffSpecs(
      { content: base.content, format },
      { content: target.content, format },
    );
  } catch (error) {
    if (error instanceof ComparisonServiceError) {
      const failed = await createFailedComparison(project.id, base, target, error.code).catch(
        () => null,
      );
      return errorResponse(
        error.status === 422 || error.status === 504 ? error.status : 502,
        error.code,
        error.message,
        failed ? { comparisonId: failed.id } : undefined,
      );
    }

    const failed = await createFailedComparison(
      project.id,
      base,
      target,
      "COMPARISON_UNAVAILABLE",
    ).catch(() => null);
    return errorResponse(
      502,
      "COMPARISON_UNAVAILABLE",
      "The comparison service could not be reached.",
      failed ? { comparisonId: failed.id } : undefined,
    );
  }

  const env = getEnv();
  if (diff.changes.length > env.MAX_CHANGES_PER_COMPARISON) {
    const failed = await createFailedComparison(
      project.id,
      base,
      target,
      "TOO_MANY_CHANGES",
    ).catch(() => null);
    return errorResponse(
      422,
      "TOO_MANY_CHANGES",
      "The comparison contains too many changes.",
      failed ? { comparisonId: failed.id } : undefined,
    );
  }

  try {
    const created = await getDb().$transaction(
      async (tx) => {
        const comparison = await tx.comparison.create({
          data: {
            projectId: project.id,
            baseVersionId: base.id,
            targetVersionId: target.id,
            status: "completed",
            engineVersion: diff.engineVersion,
            durationMs: diff.durationMs,
            totalChanges: diff.changes.length,
            changes: toStoredChanges(diff.changes) as Prisma.InputJsonValue,
          },
        });

        await tx.project.update({
          where: { id: project.id },
          data: { updatedAt: new Date() },
        });

        return comparison;
      },
      { maxWait: 5_000, timeout: 60_000 },
    );

    return ok({ comparison: comparisonSummary(created, base, target) }, 201);
  } catch (error) {
    console.error(
      "comparison create: database error",
      error instanceof Error ? error.message : "unknown error",
    );
    return errorResponse(500, "INTERNAL", "Could not save the comparison.");
  }
}
