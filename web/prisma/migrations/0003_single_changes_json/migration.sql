-- Add the single structured changes payload
ALTER TABLE "Comparison" ADD COLUMN "totalChanges" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Comparison" ADD COLUMN "changes" JSONB NOT NULL DEFAULT '[]';

-- Remove the old per-finding tables
DROP TABLE "ComparisonFinding";
DROP TABLE "ComparisonDiffChange";
DROP TABLE "ComparisonDeprecation";

-- Remove the old comparison outputs and counters
ALTER TABLE "Comparison"
  DROP COLUMN "rawDiffText",
  DROP COLUMN "summary",
  DROP COLUMN "totalChangelog",
  DROP COLUMN "totalBreaking",
  DROP COLUMN "totalDeprecations",
  DROP COLUMN "totalDiffChanges";
