ALTER TABLE "Product"
ADD COLUMN "kitchenCategory" VARCHAR(64),
ADD COLUMN "kitchenPrepTimeMinutes" INTEGER,
ADD CONSTRAINT "Product_kitchenPrepTimeMinutes_check"
  CHECK ("kitchenPrepTimeMinutes" IS NULL OR "kitchenPrepTimeMinutes" BETWEEN 1 AND 1440);

ALTER TABLE "SalesOrder"
ADD COLUMN "kitchenStartedAt" TIMESTAMP(3),
ADD COLUMN "kitchenReadyAt" TIMESTAMP(3),
ADD COLUMN "kitchenAssignedUserId" TEXT,
ADD CONSTRAINT "SalesOrder_KitchenAssignee_fkey"
  FOREIGN KEY ("kitchenAssignedUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SalesOrder_tenantId_outletId_kitchenReleasedAt_idx"
ON "SalesOrder"("tenantId", "outletId", "kitchenReleasedAt");

ALTER TABLE "SalesOrderItem"
ADD COLUMN "kitchenCategorySnapshot" VARCHAR(64),
ADD COLUMN "kitchenPrepTimeMinutes" INTEGER,
ADD COLUMN "kitchenStationId" TEXT,
ADD COLUMN "kitchenStartedAt" TIMESTAMP(3),
ADD COLUMN "kitchenCompletedAt" TIMESTAMP(3),
ADD CONSTRAINT "SalesOrderItem_kitchenPrepTimeMinutes_check"
  CHECK ("kitchenPrepTimeMinutes" IS NULL OR "kitchenPrepTimeMinutes" BETWEEN 1 AND 1440);

CREATE INDEX "SalesOrderItem_kitchenStationId_idx"
ON "SalesOrderItem"("kitchenStationId");

CREATE TABLE "KitchenStation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "outletId" TEXT NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KitchenStation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KitchenStation_Tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "KitchenStation_Outlet_fkey"
    FOREIGN KEY ("outletId") REFERENCES "Outlet"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "KitchenStation_name_check"
    CHECK (length(trim("name")) > 0),
  CONSTRAINT "KitchenStation_displayOrder_check"
    CHECK ("displayOrder" >= 0)
);

CREATE UNIQUE INDEX "KitchenStation_tenantId_outletId_name_key"
ON "KitchenStation"("tenantId", "outletId", "name");
CREATE INDEX "KitchenStation_tenantId_outletId_isActive_displayOrder_idx"
ON "KitchenStation"("tenantId", "outletId", "isActive", "displayOrder");

ALTER TABLE "SalesOrderItem"
ADD CONSTRAINT "SalesOrderItem_KitchenStation_fkey"
  FOREIGN KEY ("kitchenStationId") REFERENCES "KitchenStation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "KitchenStationCategory" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "outletId" TEXT NOT NULL,
  "stationId" TEXT NOT NULL,
  "category" VARCHAR(64) NOT NULL,
  CONSTRAINT "KitchenStationCategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KitchenStationCategory_Station_fkey"
    FOREIGN KEY ("stationId") REFERENCES "KitchenStation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "KitchenStationCategory_Tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "KitchenStationCategory_Outlet_fkey"
    FOREIGN KEY ("outletId") REFERENCES "Outlet"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "KitchenStationCategory_category_check"
    CHECK (length(trim("category")) > 0)
);

CREATE UNIQUE INDEX "KitchenStationCategory_outletId_category_key"
ON "KitchenStationCategory"("outletId", "category");
CREATE INDEX "KitchenStationCategory_tenantId_outletId_stationId_idx"
ON "KitchenStationCategory"("tenantId", "outletId", "stationId");
