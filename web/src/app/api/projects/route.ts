import { z } from "zod";
import { errorResponse, isJsonRequest, isSameOrigin, ok, readJson } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse(401, "UNAUTHORIZED", "You are not signed in.");
  }

  const projects = await getDb().project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { versions: true, comparisons: true } },
    },
  });

  return ok({
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      versionCount: project._count.versions,
      comparisonCount: project._count.comparisons,
    })),
  });
}

export async function POST(request: Request) {
  if (!isJsonRequest(request)) {
    return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.");
  }
  if (!isSameOrigin(request)) {
    return errorResponse(403, "INVALID_ORIGIN", "The request origin is not allowed.");
  }

  const user = await getCurrentUser();
  if (!user) {
    return errorResponse(401, "UNAUTHORIZED", "You are not signed in.");
  }

  const body = await readJson<unknown>(request);
  if (body === null) {
    return errorResponse(400, "BAD_REQUEST", "The request body is not valid JSON.");
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "BAD_REQUEST", "A project name of 1–100 characters is required.");
  }

  try {
    const project = await getDb().project.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        description: parsed.data.description || null,
      },
    });

    return ok(
      {
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          versionCount: 0,
          comparisonCount: 0,
        },
      },
      201,
    );
  } catch {
    console.error("project create: database error");
    return errorResponse(500, "INTERNAL", "Could not create the project.");
  }
}
