ALTER TABLE "OutboxEvent"
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

CREATE INDEX "OutboxEvent_status_nextAttemptAt_idx"
ON "OutboxEvent"("status", "nextAttemptAt");
