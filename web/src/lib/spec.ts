import { parse as parseYaml } from "yaml";

export type SpecFormat = "yaml" | "json";

export type ParsedSpec = {
  format: SpecFormat;
  openapiVersion: string;
  title: string;
};

export class SpecError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SpecError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSpec(content: string, filename: string): ParsedSpec {
  const text = content.replace(/^\uFEFF/, "");
  if (!text.trim()) {
    throw new SpecError("INVALID_SPEC", "The spec is empty.");
  }
  if (text.includes("\0")) {
    throw new SpecError("INVALID_SPEC", "The spec contains a null byte.");
  }

  const extension = filename.toLowerCase().split(".").pop();
  const format: SpecFormat = extension === "json" ? "json" : "yaml";

  let value: unknown;
  try {
    value = format === "json" ? JSON.parse(text) : parseYaml(text);
  } catch {
    throw new SpecError(
      "INVALID_SPEC",
      format === "json" ? "The spec is not valid JSON." : "The spec is not valid YAML.",
    );
  }

  if (!isRecord(value)) {
    throw new SpecError("INVALID_SPEC", "The spec must be a JSON/YAML object.");
  }

  let openapi = "";
  if (typeof value.openapi === "string") {
    openapi = value.openapi.trim();
  } else if (typeof value.openapi === "number") {
    openapi = String(value.openapi);
  }

  if (!/^3\.(0|1)(\.\d+)?$/.test(openapi)) {
    throw new SpecError(
      "UNSUPPORTED_OPENAPI_VERSION",
      "Only OpenAPI 3.0.x and 3.1.x are supported.",
    );
  }

  const info = isRecord(value.info) ? value.info : {};
  const rawTitle = typeof info.title === "string" ? info.title.trim() : "";
  const title = (rawTitle || filename).slice(0, 300);

  return { format, openapiVersion: openapi, title };
}
