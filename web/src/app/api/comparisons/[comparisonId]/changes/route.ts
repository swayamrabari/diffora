import { errorResponse, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { findComparisonForUser } from "@/lib/queries";

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

  return ok({ changes: comparison.changes, total: comparison.totalChanges });
}
