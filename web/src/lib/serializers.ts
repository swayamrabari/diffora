// Turns database rows into the plain JSON shapes returned by the API routes.

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
  totalChanges: number;
  createdAt: Date;
  baseVersion: { id: string; label: string };
  targetVersion: { id: string; label: string };
};

export function toComparisonSummary(comparison: ComparisonWithVersions) {
  return {
    id: comparison.id,
    status: comparison.status,
    totalChanges: comparison.totalChanges,
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
  totalChanges: number;
  changes: unknown;
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
    totalChanges: comparison.totalChanges,
    changes: comparison.changes,
    errorMessage: comparison.errorMessage,
    createdAt: comparison.createdAt,
    project: comparison.project,
    baseVersion: comparison.baseVersion,
    targetVersion: comparison.targetVersion,
  };
}
