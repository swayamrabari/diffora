// Server-side database lookups for pages and API routes. Every lookup is
// scoped to the signed-in user, so someone else's record simply reads as
// "not found".

import "server-only";
import { getDb } from "@/lib/db";
import { isUuid } from "@/lib/ids";

export async function findProjectForUser(userId: string, projectId: string) {
  if (!isUuid(projectId)) {
    return null;
  }
  return getDb().project.findFirst({
    where: { id: projectId, userId },
  });
}

export async function findVersionForUser(userId: string, versionId: string) {
  if (!isUuid(versionId)) {
    return null;
  }
  return getDb().apiVersion.findFirst({
    where: { id: versionId, project: { userId } },
    include: { project: true },
  });
}

export async function findComparisonForUser(userId: string, comparisonId: string) {
  if (!isUuid(comparisonId)) {
    return null;
  }
  return getDb().comparison.findFirst({
    where: { id: comparisonId, project: { userId } },
    include: {
      project: { select: { id: true, name: true } },
      baseVersion: {
        select: { id: true, label: true, title: true, specFormat: true },
      },
      targetVersion: {
        select: { id: true, label: true, title: true, specFormat: true },
      },
    },
  });
}
