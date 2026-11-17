import { createHash } from "node:crypto";
import { errorResponse, isSameOrigin, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import {
  ComparisonServiceError,
  validateSpec,
} from "@/lib/comparison-client";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { findProjectForUser } from "@/lib/queries";
import { toVersionSummary } from "@/lib/serializers";
import { parseSpec, SpecError } from "@/lib/spec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ projectId: string }> };

const EXTENSIONS = new Set(["yaml", "yml", "json"]);

export async function POST(request: Request, context: RouteContext) {
  if (!isSameOrigin(request)) {
    return errorResponse(403, "INVALID_ORIGIN", "The request origin is not allowed.");
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "Use multipart/form-data for uploads.");
  }

  const user = await getCurrentUser();
  if (!user) {
    return errorResponse(401, "UNAUTHORIZED", "You are not signed in.");
  }

  const { projectId } = await context.params;
  const project = await findProjectForUser(user.id, projectId);
  if (!project) {
    return errorResponse(404, "NOT_FOUND", "Project not found.");
  }

  const env = getEnv();
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > env.MAX_UPLOAD_REQUEST_BYTES) {
    return errorResponse(413, "PAYLOAD_TOO_LARGE", "The upload request is too large.");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(400, "BAD_REQUEST", "The upload form could not be read.");
  }

  const fileValue = formData.get("file");
  const labelValue = formData.get("label");
  const descriptionValue = formData.get("description");

  if (!(fileValue instanceof File) || typeof labelValue !== "string") {
    return errorResponse(400, "BAD_REQUEST", "A file and label are required.");
  }

  const file = fileValue;
  const label = labelValue.trim();
  const description =
    typeof descriptionValue === "string" ? descriptionValue.trim() : "";

  if (label.length < 1 || label.length > 50) {
    return errorResponse(400, "BAD_REQUEST", "The label must be 1–50 characters.");
  }
  if (description.length > 500) {
    return errorResponse(400, "BAD_REQUEST", "The description must be at most 500 characters.");
  }
  if (file.size <= 0) {
    return errorResponse(422, "INVALID_SPEC", "The spec is empty.");
  }
  if (file.size > env.MAX_SPEC_BYTES) {
    return errorResponse(413, "FILE_TOO_LARGE", "The spec file is too large.");
  }

  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  if (!EXTENSIONS.has(extension)) {
    return errorResponse(400, "UNSUPPORTED_EXTENSION", "Upload a .yaml, .yml, or .json file.");
  }

  let content: string;
  try {
    const buffer = await file.arrayBuffer();
    content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    return errorResponse(400, "INVALID_ENCODING", "The file is not valid UTF-8.");
  }

  let parsed;
  try {
    parsed = parseSpec(content, file.name);
  } catch (error) {
    if (error instanceof SpecError) {
      return errorResponse(422, error.code, error.message);
    }
    return errorResponse(422, "INVALID_SPEC", "The spec could not be parsed.");
  }

  try {
    await validateSpec(content, parsed.format);
  } catch (error) {
    if (error instanceof ComparisonServiceError) {
      if (error.status === 422) {
        return errorResponse(422, error.code, error.message);
      }
      if (error.status === 504) {
        return errorResponse(504, "COMPARISON_TIMEOUT", error.message);
      }
      return errorResponse(502, "COMPARISON_UNAVAILABLE", error.message);
    }
    return errorResponse(502, "COMPARISON_UNAVAILABLE", "The spec could not be validated.");
  }

  const checksum = createHash("sha256").update(content, "utf8").digest("hex");

  try {
    const created = await getDb().$transaction(async (tx) => {
      const version = await tx.apiVersion.create({
        data: {
          projectId: project.id,
          label,
          labelNormalized: label.toLowerCase(),
          description: description || null,
          openapiVersion: parsed.openapiVersion,
          specFormat: parsed.format,
          originalFilename: file.name.slice(0, 255),
          fileSize: file.size,
          checksum,
          title: parsed.title,
          content,
        },
      });
      await tx.project.update({
        where: { id: project.id },
        data: { updatedAt: new Date() },
      });
      return version;
    });

    return ok({ version: toVersionSummary(created) }, 201);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return errorResponse(409, "DUPLICATE_LABEL", "A version with this label already exists.");
    }
    console.error("version upload: database error");
    return errorResponse(500, "INTERNAL", "Could not save the version.");
  }
}
