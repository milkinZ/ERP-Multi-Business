ALTER TABLE "Tenant"
ADD COLUMN "currencyCode" CHAR(3);

ALTER TABLE "SalesOrder"
ADD COLUMN "currencyCode" CHAR(3);

ALTER TABLE "PurchaseOrder"
ADD COLUMN "currencyCode" CHAR(3);
