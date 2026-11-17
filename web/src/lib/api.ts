import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    { error: details ? { code, message, details } : { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function ok<T>(value: T, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function isJsonRequest(request: Request): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.split(";")[0]?.trim().toLowerCase() === "application/json";
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    return origin === getEnv().APP_ORIGIN;
  }
  const site = request.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
