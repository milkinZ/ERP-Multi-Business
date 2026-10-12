CREATE TABLE "InvoiceNumberCounter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceNumberCounter_pkey" PRIMARY KEY ("key")
);

INSERT INTO "InvoiceNumberCounter" ("key", "value", "updatedAt")
SELECT
    'global',
    COALESCE(MAX((regexp_match("invoiceNumber", '^INV-[0-9]{6}-([0-9]{6})$'))[1]::INTEGER), 0),
    CURRENT_TIMESTAMP
FROM "Invoice"
WHERE "invoiceNumber" ~ '^INV-[0-9]{6}-[0-9]{6}$';