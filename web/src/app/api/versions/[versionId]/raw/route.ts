import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { findVersionForUser } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ versionId: string }> };

function safeFilename(value: string): string {
  const cleaned = value
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_")
    .slice(0, 255);
  return cleaned || "spec.txt";
}

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

  return new NextResponse(version.content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `inline; filename="${safeFilename(version.originalFilename)}"`,
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
