import { z } from "zod";

export const findingSchema = z.object({
  id: z.string(),
  text: z.string(),
  level: z.number().int(),
  levelName: z.string(),
  operation: z.string().optional(),
  operationId: z.string().optional(),
  path: z.string().optional(),
  section: z.string().optional(),
  line: z.number().int().optional(),
  column: z.number().int().optional(),
  endLine: z.number().int().optional(),
  endColumn: z.number().int().optional(),
});

export const deprecationSchema = z.object({
  pointer: z.string(),
  path: z.string().optional(),
  method: z.string().optional(),
  oldValue: z.unknown().optional(),
  newValue: z.unknown().optional(),
  oldValuePresent: z.boolean(),
  newValuePresent: z.boolean(),
});

export const diffResponseSchema = z.object({
  engineVersion: z.string(),
  durationMs: z.number().int().nonnegative(),
  rawDiffText: z.string(),
  changelog: z.array(findingSchema),
  summary: z.record(z.string(), z.unknown()),
  breaking: z.array(findingSchema),
  deprecations: z.array(deprecationSchema),
});

export type Finding = z.infer<typeof findingSchema>;
export type Deprecation = z.infer<typeof deprecationSchema>;
export type DiffResponse = z.infer<typeof diffResponseSchema>;
