import { Prisma } from "@/generated/prisma/client";
import { errorResponse, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { findComparisonForUser } from "@/lib/queries";
import { toDiffChange } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ comparisonId: string }> };

function positiveInt(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse(401, "UNAUTHORIZED", "You are not signed in.");
  }

  const { comparisonId } = await context.params;
  const comparison = await findComparisonForUser(user.id, comparisonId);
  if (!comparison) {
    return errorResponse(404, "NOT_FOUND", "Comparison not found.");
  }

  const url = new URL(request.url);
  const page = positiveInt(url.searchParams.get("page"), 1);
  const pageSize = Math.min(positiveInt(url.searchParams.get("pageSize"), 50), 200);
  const category = url.searchParams.get("category")?.trim();
  const changeType = url.searchParams.get("changeType")?.trim();
  const method = url.searchParams.get("method")?.trim().toUpperCase();
  const path = url.searchParams.get("path")?.trim();
  const q = url.searchParams.get("q")?.trim();

  const where: Prisma.ComparisonDiffChangeWhereInput = {
    comparisonId: comparison.id,
    ...(category ? { category } : {}),
    ...(changeType ? { changeType } : {}),
    ...(method ? { method } : {}),
    ...(path ? { path: { contains: path, mode: "insensitive" } } : {}),
    ...(q
      ? {
          OR: [
            { field: { contains: q, mode: "insensitive" } },
            { path: { contains: q, mode: "insensitive" } },
            { component: { contains: q, mode: "insensitive" } },
            { displayPointer: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const db = getDb();
  const [total, rows] = await Promise.all([
    db.comparisonDiffChange.count({ where }),
    db.comparisonDiffChange.findMany({
      where,
      orderBy: { position: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok({
    items: rows.map(toDiffChange),
    total,
    page,
    pageSize,
  });
}
