import { Prisma } from "@/generated/prisma/client";
import type { Deprecation, DiffChange, Finding } from "@/types/comparison";

export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    return [items];
  }
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function findingRows(
  comparisonId: string,
  kind: "changelog" | "breaking",
  findings: Finding[],
) {
  return findings.map((finding, position) => ({
    comparisonId,
    kind,
    position,
    ruleId: finding.id,
    level: finding.level,
    levelName: finding.levelName,
    text: finding.text,
    operation: finding.operation ?? null,
    operationId: finding.operationId ?? null,
    path: finding.path ?? null,
    section: finding.section ?? null,
    line: finding.line ?? null,
    column: finding.column ?? null,
    endLine: finding.endLine ?? null,
    endColumn: finding.endColumn ?? null,
  }));
}

export function diffChangeRows(comparisonId: string, changes: DiffChange[]) {
  return changes.map((change, position) => ({
    comparisonId,
    position,
    category: change.category,
    changeType: change.changeType,
    subcategory: change.subcategory,
    path: change.path,
    method: change.method,
    component: change.component,
    field: change.field,
    basePointer: change.basePointer,
    targetPointer: change.targetPointer,
    displayPointer: change.displayPointer,
    oldValue: jsonValue(change.oldValuePresent, change.oldValue),
    newValue: jsonValue(change.newValuePresent, change.newValue),
    oldValuePresent: change.oldValuePresent,
    newValuePresent: change.newValuePresent,
  }));
}

export function deprecationRows(comparisonId: string, deprecations: Deprecation[]) {
  return deprecations.map((deprecation, position) => ({
    comparisonId,
    position,
    pointer: deprecation.pointer,
    path: deprecation.path ?? null,
    method: deprecation.method ?? null,
    oldValue: jsonValue(deprecation.oldValuePresent, deprecation.oldValue),
    newValue: jsonValue(deprecation.newValuePresent, deprecation.newValue),
    oldValuePresent: deprecation.oldValuePresent,
    newValuePresent: deprecation.newValuePresent,
  }));
}

function jsonValue(
  present: boolean,
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull | typeof Prisma.JsonNull {
  if (!present) {
    return Prisma.DbNull;
  }
  if (value === null) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
}
