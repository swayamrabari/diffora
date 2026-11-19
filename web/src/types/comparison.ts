import { z } from "zod";

export const sourceLineSchema = z.object({
  kind: z.enum(["context", "added", "removed", "gap"]),
  oldLine: z.number().int().positive().nullable().optional(),
  newLine: z.number().int().positive().nullable().optional(),
  text: z.string(),
});

export const sourceHunkSchema = z.object({
  lines: z.array(sourceLineSchema),
});

export const sourceDiffSchema = z.object({
  hunks: z.array(sourceHunkSchema),
});

export const diffChangeSchema = z.object({
  id: z.string(),
  category: z.string(),
  changeType: z.enum(["added", "removed", "modified"]),
  subcategory: z.string().nullable(),
  path: z.string().nullable(),
  method: z.string().nullable(),
  component: z.string().nullable(),
  field: z.string().nullable(),
  oldValue: z.unknown().optional(),
  newValue: z.unknown().optional(),
  oldValuePresent: z.boolean(),
  newValuePresent: z.boolean(),
  source: sourceDiffSchema.optional(),
});

export const diffResponseSchema = z.object({
  engineVersion: z.string(),
  durationMs: z.number().int().nonnegative(),
  changes: z.array(diffChangeSchema),
});

export type SourceLine = z.infer<typeof sourceLineSchema>;
export type SourceHunk = z.infer<typeof sourceHunkSchema>;
export type SourceDiff = z.infer<typeof sourceDiffSchema>;
export type DiffChange = z.infer<typeof diffChangeSchema>;
export type DiffResponse = z.infer<typeof diffResponseSchema>;
