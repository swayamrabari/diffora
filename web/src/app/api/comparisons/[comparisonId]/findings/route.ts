import { Prisma } from "@/generated/prisma/client";
import { errorResponse, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { findComparisonForUser } from "@/lib/queries";
import { toFinding } from "@/lib/serializers";

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
  const kind = url.searchParams.get("kind") ?? "changelog";
  if (kind !== "changelog" && kind !== "breaking") {
    return errorResponse(400, "BAD_REQUEST", "kind must be changelog or breaking.");
  }

  const page = positiveInt(url.searchParams.get("page"), 1);
  const pageSize = Math.min(positiveInt(url.searchParams.get("pageSize"), 50), 100);
  const levelRaw = url.searchParams.get("level");
  const level = levelRaw ? Number(levelRaw) : undefined;
  if (level !== undefined && (!Number.isInteger(level) || level < 1 || level > 3)) {
    return errorResponse(400, "BAD_REQUEST", "level must be 1, 2, or 3.");
  }

  const section = url.searchParams.get("section")?.trim();
  const operation = url.searchParams.get("operation")?.trim().toUpperCase();
  const path = url.searchParams.get("path")?.trim();
  const ruleId = url.searchParams.get("ruleId")?.trim();
  const q = url.searchParams.get("q")?.trim();

  const where: Prisma.ComparisonFindingWhereInput = {
    comparisonId: comparison.id,
    kind,
    ...(level !== undefined ? { level } : {}),
    ...(section ? { section } : {}),
    ...(operation ? { operation } : {}),
    ...(path ? { path: { contains: path, mode: "insensitive" } } : {}),
    ...(ruleId ? { ruleId } : {}),
    ...(q
      ? {
          OR: [
            { text: { contains: q, mode: "insensitive" } },
            { operationId: { contains: q, mode: "insensitive" } },
            { path: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const db = getDb();
  const [total, rows] = await Promise.all([
    db.comparisonFinding.count({ where }),
    db.comparisonFinding.findMany({
      where,
      orderBy: { position: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok({
    items: rows.map(toFinding),
    total,
    page,
    pageSize,
  });
}
