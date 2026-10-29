-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('STARTING', 'ACTIVE', 'DRAINING', 'STOPPED', 'STALE');

-- CreateTable
CREATE TABLE "WorkerInstance" (
    "id" TEXT NOT NULL,
    "workerKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT,
    "instancePid" INTEGER,
    "version" TEXT,
    "status" "WorkerStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerInstance_workerKey_key"
    ON "WorkerInstance"("workerKey");

CREATE INDEX "WorkerInstance_status_idx"
    ON "WorkerInstance"("status");

CREATE INDEX "WorkerInstance_lastHeartbeatAt_idx"
    ON "WorkerInstance"("lastHeartbeatAt");

CREATE INDEX "WorkerInstance_name_idx"
    ON "WorkerInstance"("name");
