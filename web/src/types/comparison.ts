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

export const diffChangeSchema = z.object({
  category: z.string(),
  changeType: z.enum(["added", "removed", "modified"]),
  subcategory: z.string().nullable(),
  path: z.string().nullable(),
  method: z.string().nullable(),
  component: z.string().nullable(),
  field: z.string().nullable(),
  basePointer: z.string().nullable(),
  targetPointer: z.string().nullable(),
  displayPointer: z.string(),
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
  changes: z.array(diffChangeSchema),
});

export type Finding = z.infer<typeof findingSchema>;
export type Deprecation = z.infer<typeof deprecationSchema>;
export type DiffChange = z.infer<typeof diffChangeSchema>;
export type DiffResponse = z.infer<typeof diffResponseSchema>;
