import { errorResponse, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { findComparisonForUser } from "@/lib/queries";
import { toDeprecation } from "@/lib/serializers";

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

  const rows = await getDb().comparisonDeprecation.findMany({
    where: { comparisonId: comparison.id },
    orderBy: { position: "asc" },
  });

  return ok({ items: rows.map(toDeprecation) });
}
