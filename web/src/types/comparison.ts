import { z } from "zod";

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
});

export const diffResponseSchema = z.object({
  engineVersion: z.string(),
  durationMs: z.number().int().nonnegative(),
  changes: z.array(diffChangeSchema),
});

export type DiffChange = z.infer<typeof diffChangeSchema>;
export type DiffResponse = z.infer<typeof diffResponseSchema>;
