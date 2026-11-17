import { errorResponse, isSameOrigin, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { findComparisonForUser } from "@/lib/queries";
import { toComparisonDetail } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ comparisonId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse(401, "UNAUTHORIZED", "You are not signed in.");
  }

  const { comparisonId } = await context.params;
  const comparison = await findComparisonForUser(user.id, comparisonId);
  if (!comparison) {
    return errorResponse(404, "NOT_FOUND", "Comparison not found.");
  }

  return ok({ comparison: toComparisonDetail(comparison) });
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!isSameOrigin(request)) {
    return errorResponse(403, "INVALID_ORIGIN", "The request origin is not allowed.");
  }

  const user = await getCurrentUser();
  if (!user) {
    return errorResponse(401, "UNAUTHORIZED", "You are not signed in.");
  }

  const { comparisonId } = await context.params;
  const comparison = await findComparisonForUser(user.id, comparisonId);
  if (!comparison) {
    return errorResponse(404, "NOT_FOUND", "Comparison not found.");
  }

  try {
    await getDb().comparison.delete({ where: { id: comparison.id } });
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.error("comparison delete: database error");
    return errorResponse(500, "INTERNAL", "Could not delete the comparison.");
  }
}
