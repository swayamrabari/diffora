import type { ApiVersion } from "@/generated/prisma/client";

export function toVersionSummary(version: ApiVersion) {
  return {
    id: version.id,
    projectId: version.projectId,
    label: version.label,
    description: version.description,
    openapiVersion: version.openapiVersion,
    specFormat: version.specFormat,
    originalFilename: version.originalFilename,
    fileSize: version.fileSize,
    checksum: version.checksum,
    title: version.title,
    createdAt: version.createdAt,
  };
}

type ComparisonWithVersions = {
  id: string;
  status: string;
  totalChangelog: number;
  totalBreaking: number;
  totalDeprecations: number;
  createdAt: Date;
  baseVersion: { id: string; label: string };
  targetVersion: { id: string; label: string };
};

export function toComparisonSummary(comparison: ComparisonWithVersions) {
  return {
    id: comparison.id,
    status: comparison.status,
    totalChangelog: comparison.totalChangelog,
    totalBreaking: comparison.totalBreaking,
    totalDeprecations: comparison.totalDeprecations,
    createdAt: comparison.createdAt,
    baseVersion: comparison.baseVersion,
    targetVersion: comparison.targetVersion,
  };
}

type ComparisonDetail = {
  id: string;
  projectId: string;
  status: string;
  engineVersion: string;
  durationMs: number;
  totalChangelog: number;
  totalBreaking: number;
  totalDeprecations: number;
  summary: unknown;
  errorMessage: string | null;
  createdAt: Date;
  project: { id: string; name: string };
  baseVersion: { id: string; label: string; title: string; specFormat: string };
  targetVersion: { id: string; label: string; title: string; specFormat: string };
};

export function toComparisonDetail(comparison: ComparisonDetail) {
  return {
    id: comparison.id,
    projectId: comparison.projectId,
    status: comparison.status,
    engineVersion: comparison.engineVersion,
    durationMs: comparison.durationMs,
    totalChangelog: comparison.totalChangelog,
    totalBreaking: comparison.totalBreaking,
    totalDeprecations: comparison.totalDeprecations,
    summary: comparison.summary,
    errorMessage: comparison.errorMessage,
    createdAt: comparison.createdAt,
    project: comparison.project,
    baseVersion: comparison.baseVersion,
    targetVersion: comparison.targetVersion,
  };
}

type FindingRow = {
  id: string;
  kind: string;
  position: number;
  ruleId: string;
  level: number;
  levelName: string;
  text: string;
  operation: string | null;
  operationId: string | null;
  path: string | null;
  section: string | null;
  line: number | null;
  column: number | null;
  endLine: number | null;
  endColumn: number | null;
};

export function toFinding(row: FindingRow) {
  return {
    id: row.id,
    kind: row.kind,
    position: row.position,
    ruleId: row.ruleId,
    level: row.level,
    levelName: row.levelName,
    text: row.text,
    operation: row.operation,
    operationId: row.operationId,
    path: row.path,
    section: row.section,
    line: row.line,
    column: row.column,
    endLine: row.endLine,
    endColumn: row.endColumn,
  };
}

type DeprecationRow = {
  id: string;
  position: number;
  pointer: string;
  path: string | null;
  method: string | null;
  oldValue: unknown;
  newValue: unknown;
  oldValuePresent: boolean;
  newValuePresent: boolean;
};

export function toDeprecation(row: DeprecationRow) {
  return {
    id: row.id,
    position: row.position,
    pointer: row.pointer,
    path: row.path,
    method: row.method,
    oldValue: row.oldValue,
    newValue: row.newValue,
    oldValuePresent: row.oldValuePresent,
    newValuePresent: row.newValuePresent,
  };
}
