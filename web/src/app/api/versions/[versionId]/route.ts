import { errorResponse, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { findVersionForUser } from "@/lib/queries";
import { toVersionSummary } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ versionId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse(401, "UNAUTHORIZED", "You are not signed in.");
  }

  const { versionId } = await context.params;
  const version = await findVersionForUser(user.id, versionId);
  if (!version) {
    return errorResponse(404, "NOT_FOUND", "Version not found.");
  }

  return ok({
    version: toVersionSummary(version),
    project: { id: version.project.id, name: version.project.name },
  });
}
