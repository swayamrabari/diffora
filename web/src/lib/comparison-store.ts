import type { DiffChange } from "@/types/comparison";

// The service already emits unique changes. This mapper only strips internal
// fields before the array is stored as one JSONB value on Comparison.
export function toStoredChanges(changes: DiffChange[]) {
  return changes.map((change) => ({
    id: change.id,
    category: change.category,
    changeType: change.changeType,
    subcategory: change.subcategory,
    path: change.path,
    method: change.method,
    component: change.component,
    field: change.field,
    ...(change.oldValuePresent ? { oldValue: change.oldValue } : {}),
    ...(change.newValuePresent ? { newValue: change.newValue } : {}),
    oldValuePresent: change.oldValuePresent,
    newValuePresent: change.newValuePresent,
    ...(change.source ? { source: change.source } : {}),
  }));
}
