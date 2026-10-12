-- CreateEnum
CREATE TYPE "JobExecutionStatus" AS ENUM ('ACTIVE', 'RETRYING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "JobExecution" (
    "id" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "bullmqJobId" TEXT NOT NULL,
    "jobName" TEXT,
    "workerId" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "JobExecutionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "errorCategory" TEXT,
    "errorMessage" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobExecution_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JobExecution_workerId_fkey"
        FOREIGN KEY ("workerId")
        REFERENCES "WorkerInstance"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "JobExecution_queueName_bullmqJobId_attemptNumber_key"
    ON "JobExecution"("queueName", "bullmqJobId", "attemptNumber");

CREATE INDEX "JobExecution_queueName_idx"
    ON "JobExecution"("queueName");

CREATE INDEX "JobExecution_status_idx"
    ON "JobExecution"("status");

CREATE INDEX "JobExecution_workerId_idx"
    ON "JobExecution"("workerId");

CREATE INDEX "JobExecution_startedAt_idx"
    ON "JobExecution"("startedAt");
