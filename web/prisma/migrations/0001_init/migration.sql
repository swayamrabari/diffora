-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "passwordHash" VARCHAR(60) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiVersion" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "label" VARCHAR(50) NOT NULL,
    "labelNormalized" VARCHAR(50) NOT NULL,
    "description" VARCHAR(500),
    "openapiVersion" VARCHAR(20) NOT NULL,
    "specFormat" VARCHAR(5) NOT NULL,
    "originalFilename" VARCHAR(255) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comparison" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "baseVersionId" UUID NOT NULL,
    "targetVersionId" UUID NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "engineVersion" VARCHAR(64) NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "rawDiffText" TEXT,
    "summary" JSONB,
    "totalChangelog" INTEGER NOT NULL DEFAULT 0,
    "totalBreaking" INTEGER NOT NULL DEFAULT 0,
    "totalDeprecations" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComparisonFinding" (
    "id" UUID NOT NULL,
    "comparisonId" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "position" INTEGER NOT NULL,
    "ruleId" VARCHAR(160) NOT NULL,
    "level" INTEGER NOT NULL,
    "levelName" VARCHAR(10) NOT NULL,
    "text" TEXT NOT NULL,
    "operation" VARCHAR(10),
    "operationId" VARCHAR(200),
    "path" VARCHAR(500),
    "section" VARCHAR(50),
    "line" INTEGER,
    "column" INTEGER,
    "endLine" INTEGER,
    "endColumn" INTEGER,

    CONSTRAINT "ComparisonFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComparisonDeprecation" (
    "id" UUID NOT NULL,
    "comparisonId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "pointer" TEXT NOT NULL,
    "path" VARCHAR(500),
    "method" VARCHAR(10),
    "oldValue" JSONB,
    "newValue" JSONB,
    "oldValuePresent" BOOLEAN NOT NULL DEFAULT false,
    "newValuePresent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ComparisonDeprecation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ApiVersion_projectId_createdAt_idx" ON "ApiVersion"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiVersion_projectId_checksum_idx" ON "ApiVersion"("projectId", "checksum");

-- CreateIndex
CREATE UNIQUE INDEX "ApiVersion_projectId_labelNormalized_key" ON "ApiVersion"("projectId", "labelNormalized");

-- CreateIndex
CREATE INDEX "Comparison_projectId_createdAt_idx" ON "Comparison"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Comparison_baseVersionId_idx" ON "Comparison"("baseVersionId");

-- CreateIndex
CREATE INDEX "Comparison_targetVersionId_idx" ON "Comparison"("targetVersionId");

-- CreateIndex
CREATE INDEX "ComparisonFinding_comparisonId_kind_level_idx" ON "ComparisonFinding"("comparisonId", "kind", "level");

-- CreateIndex
CREATE INDEX "ComparisonFinding_comparisonId_kind_section_idx" ON "ComparisonFinding"("comparisonId", "kind", "section");

-- CreateIndex
CREATE INDEX "ComparisonFinding_comparisonId_kind_ruleId_idx" ON "ComparisonFinding"("comparisonId", "kind", "ruleId");

-- CreateIndex
CREATE INDEX "ComparisonFinding_comparisonId_kind_operation_idx" ON "ComparisonFinding"("comparisonId", "kind", "operation");

-- CreateIndex
CREATE INDEX "ComparisonFinding_comparisonId_kind_path_idx" ON "ComparisonFinding"("comparisonId", "kind", "path");

-- CreateIndex
CREATE UNIQUE INDEX "ComparisonFinding_comparisonId_kind_position_key" ON "ComparisonFinding"("comparisonId", "kind", "position");

-- CreateIndex
CREATE INDEX "ComparisonDeprecation_comparisonId_path_idx" ON "ComparisonDeprecation"("comparisonId", "path");

-- CreateIndex
CREATE INDEX "ComparisonDeprecation_comparisonId_method_idx" ON "ComparisonDeprecation"("comparisonId", "method");

-- CreateIndex
CREATE UNIQUE INDEX "ComparisonDeprecation_comparisonId_position_key" ON "ComparisonDeprecation"("comparisonId", "position");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiVersion" ADD CONSTRAINT "ApiVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comparison" ADD CONSTRAINT "Comparison_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comparison" ADD CONSTRAINT "Comparison_baseVersionId_fkey" FOREIGN KEY ("baseVersionId") REFERENCES "ApiVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comparison" ADD CONSTRAINT "Comparison_targetVersionId_fkey" FOREIGN KEY ("targetVersionId") REFERENCES "ApiVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonFinding" ADD CONSTRAINT "ComparisonFinding_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "Comparison"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonDeprecation" ADD CONSTRAINT "ComparisonDeprecation_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "Comparison"("id") ON DELETE CASCADE ON UPDATE CASCADE;
