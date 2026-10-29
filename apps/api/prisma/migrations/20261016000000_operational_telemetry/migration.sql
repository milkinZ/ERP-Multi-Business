CREATE TABLE "OperationalEventLog" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalEventLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperationalEventLog_createdAt_id_idx"
ON "OperationalEventLog"("createdAt", "id");

CREATE INDEX "OperationalEventLog_level_createdAt_idx"
ON "OperationalEventLog"("level", "createdAt");

CREATE TABLE "OperationalMetricBucket" (
    "id" TEXT NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "statusClass" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "durationTotalMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OperationalMetricBucket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationalMetricBucket_bucketStart_method_route_statusClas_key"
ON "OperationalMetricBucket"("bucketStart", "method", "route", "statusClass");

CREATE INDEX "OperationalMetricBucket_bucketStart_idx"
ON "OperationalMetricBucket"("bucketStart");
