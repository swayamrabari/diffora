import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { findComparisonForUser } from "@/lib/queries";
import {
  toComparisonDetail,
  toDeprecation,
  toDiffChange,
  toFinding,
} from "@/lib/serializers";

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

  const db = getDb();
  const [findings, diffChanges, deprecations] = await Promise.all([
    db.comparisonFinding.findMany({
      where: { comparisonId: comparison.id },
      orderBy: [{ kind: "asc" }, { position: "asc" }],
    }),
    db.comparisonDiffChange.findMany({
      where: { comparisonId: comparison.id },
      orderBy: { position: "asc" },
    }),
    db.comparisonDeprecation.findMany({
      where: { comparisonId: comparison.id },
      orderBy: { position: "asc" },
    }),
  ]);

  let rawDiff: unknown = null;
  if (comparison.rawDiffText) {
    try {
      rawDiff = JSON.parse(comparison.rawDiffText);
    } catch {
      rawDiff = null;
    }
  }

  const body = {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    comparison: toComparisonDetail(comparison),
    findings: findings.map(toFinding),
    diffChanges: diffChanges.map(toDiffChange),
    deprecations: deprecations.map(toDeprecation),
    rawDiff,
  };

  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="diffora-comparison-${comparison.id}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
