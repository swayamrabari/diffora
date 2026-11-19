import "server-only";
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

async function callService(
  path: string,
  body: unknown,
  fallbackMessage: string,
): Promise<unknown> {
  const base = (process.env.COMPARISON_SERVICE_URL ?? "").replace(/\/+$/, "");

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shared-Secret": process.env.COMPARISON_SHARED_SECRET ?? "",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(
        Number(process.env.COMPARISON_TIMEOUT_MS ?? 90_000),
      ),
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
    const message = payload?.error?.message ?? fallbackMessage;
    throw new ComparisonServiceError(response.status, code, message);
  }

  return payload;
}

export async function validateSpec(
  content: string,
  format: "yaml" | "json",
): Promise<ValidateResponse> {
  const payload = await callService(
    "/validate",
    { content, format },
    "The spec could not be validated.",
  );
  return payload as ValidateResponse;
}

export async function diffSpecs(
  base: SpecPayload,
  target: SpecPayload,
): Promise<DiffResponse> {
  const payload = await callService(
    "/diff",
    { base, target },
    "The comparison could not be created.",
  );

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
