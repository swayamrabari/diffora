import "server-only";
import { z } from "zod";

const intString = (fallback: number) =>
  z
    .string()
    .default(String(fallback))
    .transform((value) => Number(value))
    .pipe(z.number().int().positive());

const schema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),

  JWT_SECRET: z.string().min(32),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  APP_ORIGIN: z.string().url(),

  COMPARISON_SERVICE_URL: z.string().url(),
  COMPARISON_SHARED_SECRET: z.string().min(1),
  COMPARISON_TIMEOUT_MS: intString(90_000),

  MAX_SPEC_BYTES: intString(2 * 1024 * 1024),
  MAX_UPLOAD_REQUEST_BYTES: intString(6 * 1024 * 1024),
  MAX_DIFF_RESPONSE_BYTES: intString(64 * 1024 * 1024),
  MAX_CHANGES_PER_COMPARISON: intString(5_000),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) {
    const result = schema.safeParse(process.env);
    if (!result.success) {
      const fields = result.error.issues
        .map((issue) => issue.path.join("."))
        .filter(Boolean)
        .join(", ");
      throw new Error(`Invalid environment configuration: ${fields}`);
    }
    cached = result.data;
  }
  return cached;
}
