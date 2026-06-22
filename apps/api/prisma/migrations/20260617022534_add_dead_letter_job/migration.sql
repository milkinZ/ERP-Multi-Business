-- CreateEnum
CREATE TYPE "DeadLetterJobStatus" AS ENUM ('FAILED', 'RETRYING', 'RESOLVED');

-- CreateTable
CREATE TABLE "DeadLetterJob" (
    "id" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "tenantId" TEXT,
    "outletId" TEXT,
    "payload" JSONB NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "stackTrace" TEXT,
    "attemptsMade" INTEGER NOT NULL DEFAULT 0,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retriedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "status" "DeadLetterJobStatus" NOT NULL DEFAULT 'FAILED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeadLetterJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeadLetterJob_queueName_idx" ON "DeadLetterJob"("queueName");

-- CreateIndex
CREATE INDEX "DeadLetterJob_status_idx" ON "DeadLetterJob"("status");

-- CreateIndex
CREATE INDEX "DeadLetterJob_failedAt_idx" ON "DeadLetterJob"("failedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeadLetterJob_queueName_jobId_key" ON "DeadLetterJob"("queueName", "jobId");
