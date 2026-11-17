import { z } from "zod";
import { errorResponse, isJsonRequest, isSameOrigin, ok, readJson } from "@/lib/api";
import { createSession, hashPassword, normalizeEmail, passwordByteLength } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(72),
});

export async function POST(request: Request) {
  if (!isJsonRequest(request)) {
    return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.");
  }
  if (!isSameOrigin(request)) {
    return errorResponse(403, "INVALID_ORIGIN", "The request origin is not allowed.");
  }

  const body = await readJson<unknown>(request);
  if (body === null) {
    return errorResponse(400, "BAD_REQUEST", "The request body is not valid JSON.");
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "BAD_REQUEST", "Name, email, and a password of 8–72 characters are required.");
  }
  if (passwordByteLength(parsed.data.password) > 72) {
    return errorResponse(400, "BAD_REQUEST", "Password must be at most 72 bytes.");
  }

  try {
    const user = await getDb().user.create({
      data: {
        name: parsed.data.name,
        email: normalizeEmail(parsed.data.email),
        passwordHash: await hashPassword(parsed.data.password),
      },
      select: { id: true, name: true, email: true },
    });

    await createSession(user.id);
    return ok({ user }, 201);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return errorResponse(409, "EMAIL_TAKEN", "An account with this email already exists.");
    }
    console.error("register: database error");
    return errorResponse(500, "INTERNAL", "Could not create the account.");
  }
}
