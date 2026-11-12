CREATE TYPE "PlatformSchedulerRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "PlatformSchedulerExecution" (
  "id" TEXT NOT NULL,
  "schedulerName" VARCHAR(100) NOT NULL,
  "status" "PlatformSchedulerRunStatus" NOT NULL DEFAULT 'RUNNING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  "errorCode" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformSchedulerExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformSchedulerExecution_schedulerName_startedAt_idx"
ON "PlatformSchedulerExecution"("schedulerName", "startedAt");

CREATE INDEX "PlatformSchedulerExecution_status_startedAt_idx"
ON "PlatformSchedulerExecution"("status", "startedAt");

CREATE INDEX "PlatformSchedulerExecution_startedAt_idx"
ON "PlatformSchedulerExecution"("startedAt");
