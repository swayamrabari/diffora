import { z } from "zod";
import { errorResponse, isJsonRequest, isSameOrigin, ok, readJson } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { findProjectForUser } from "@/lib/queries";
import { toComparisonSummary, toVersionSummary } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => value.name !== undefined || value.description !== undefined, {
    message: "At least one field is required.",
  });

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse(401, "UNAUTHORIZED", "You are not signed in.");
  }

  const { projectId } = await context.params;
  const project = await findProjectForUser(user.id, projectId);
  if (!project) {
    return errorResponse(404, "NOT_FOUND", "Project not found.");
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

  return ok({
    project,
    versions: versions.map(toVersionSummary),
    comparisons: comparisons.map(toComparisonSummary),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
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

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "BAD_REQUEST", "Provide a valid name or description.");
  }

  try {
    const updated = await getDb().project.update({
      where: { id: project.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description || null }
          : {}),
      },
    });

    return ok({ project: updated });
  } catch {
    console.error("project update: database error");
    return errorResponse(500, "INTERNAL", "Could not update the project.");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
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

  try {
    await getDb().project.delete({ where: { id: project.id } });
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.error("project delete: database error");
    return errorResponse(500, "INTERNAL", "Could not delete the project.");
  }
}
