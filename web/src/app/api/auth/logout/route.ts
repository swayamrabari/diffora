import { NextResponse } from "next/server";
import { errorResponse, isSameOrigin } from "@/lib/api";
import { clearSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return errorResponse(403, "INVALID_ORIGIN", "The request origin is not allowed.");
  }

  await clearSession();
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
