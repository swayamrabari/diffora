-- AlterTable
ALTER TABLE "Comparison" ADD COLUMN "totalDiffChanges" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ComparisonDiffChange" (
    "id" UUID NOT NULL,
    "comparisonId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "changeType" VARCHAR(10) NOT NULL,
    "subcategory" VARCHAR(100),
    "path" VARCHAR(500),
    "method" VARCHAR(10),
    "component" VARCHAR(200),
    "field" VARCHAR(200),
    "basePointer" TEXT,
    "targetPointer" TEXT,
    "displayPointer" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "oldValuePresent" BOOLEAN NOT NULL DEFAULT false,
    "newValuePresent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ComparisonDiffChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComparisonDiffChange_comparisonId_position_key" ON "ComparisonDiffChange"("comparisonId", "position");

-- CreateIndex
CREATE INDEX "ComparisonDiffChange_comparisonId_category_idx" ON "ComparisonDiffChange"("comparisonId", "category");

-- CreateIndex
CREATE INDEX "ComparisonDiffChange_comparisonId_changeType_idx" ON "ComparisonDiffChange"("comparisonId", "changeType");

-- CreateIndex
CREATE INDEX "ComparisonDiffChange_comparisonId_path_idx" ON "ComparisonDiffChange"("comparisonId", "path");

-- CreateIndex
CREATE INDEX "ComparisonDiffChange_comparisonId_method_idx" ON "ComparisonDiffChange"("comparisonId", "method");

-- CreateIndex
CREATE INDEX "ComparisonDiffChange_comparisonId_component_idx" ON "ComparisonDiffChange"("comparisonId", "component");

-- AddForeignKey
ALTER TABLE "ComparisonDiffChange" ADD CONSTRAINT "ComparisonDiffChange_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "Comparison"("id") ON DELETE CASCADE ON UPDATE CASCADE;
