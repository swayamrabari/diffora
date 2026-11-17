import { z } from "zod";
import { errorResponse, isJsonRequest, isSameOrigin, ok, readJson } from "@/lib/api";
import { createSession, normalizeEmail, verifyPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(72),
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
    return errorResponse(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  try {
    const user = await getDb().user.findUnique({
      where: { email: normalizeEmail(parsed.data.email) },
    });

    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return errorResponse(401, "INVALID_CREDENTIALS", "Invalid email or password.");
    }

    await createSession(user.id);
    return ok({
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch {
    console.error("login: database error");
    return errorResponse(500, "INTERNAL", "Could not sign in.");
  }
}
