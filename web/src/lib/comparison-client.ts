// Server-side HTTP client for the Go comparison service. Every call sends
// the shared secret and turns engine/timeout failures into one typed error.

import "server-only";
import { getEnv } from "@/lib/env";
import {
  diffResponseSchema,
  type DiffResponse,
} from "@/types/comparison";

export class ComparisonServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ComparisonServiceError";
    this.status = status;
    this.code = code;
  }
}

type ValidateResponse = {
  valid: boolean;
  engineVersion: string;
};

type SpecPayload = {
  content: string;
  format: "yaml" | "json";
};

export async function validateSpec(
  content: string,
  format: "yaml" | "json",
): Promise<ValidateResponse> {
  const env = getEnv();
  const base = env.COMPARISON_SERVICE_URL.replace(/\/+$/, "");

  let response: Response;
  try {
    response = await fetch(`${base}/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shared-Secret": env.COMPARISON_SHARED_SECRET,
      },
      body: JSON.stringify({ content, format }),
      signal: AbortSignal.timeout(env.COMPARISON_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ComparisonServiceError(
        504,
        "COMPARISON_TIMEOUT",
        "The comparison service timed out.",
      );
    }
    throw new ComparisonServiceError(
      502,
      "COMPARISON_UNAVAILABLE",
      "The comparison service could not be reached.",
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | null;

  if (!response.ok) {
    const code = payload?.error?.code ?? "COMPARISON_UNAVAILABLE";
    const message = payload?.error?.message ?? "The spec could not be validated.";
    throw new ComparisonServiceError(response.status, code, message);
  }

  return payload as ValidateResponse;
}

export async function diffSpecs(
  base: SpecPayload,
  target: SpecPayload,
): Promise<DiffResponse> {
  const env = getEnv();
  const service = env.COMPARISON_SERVICE_URL.replace(/\/+$/, "");

  let response: Response;
  try {
    response = await fetch(`${service}/diff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shared-Secret": env.COMPARISON_SHARED_SECRET,
      },
      body: JSON.stringify({ base, target }),
      signal: AbortSignal.timeout(env.COMPARISON_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ComparisonServiceError(
        504,
        "COMPARISON_TIMEOUT",
        "The comparison service timed out.",
      );
    }
    throw new ComparisonServiceError(
      502,
      "COMPARISON_UNAVAILABLE",
      "The comparison service could not be reached.",
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | null;

  if (!response.ok) {
    const code = payload?.error?.code ?? "COMPARISON_UNAVAILABLE";
    const message = payload?.error?.message ?? "The comparison could not be created.";
    throw new ComparisonServiceError(response.status, code, message);
  }

  const parsed = diffResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ComparisonServiceError(
      502,
      "BAD_COMPARISON_RESPONSE",
      "The comparison service returned an invalid response.",
    );
  }

  return parsed.data;
}
