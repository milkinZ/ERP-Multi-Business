CREATE INDEX "InventoryItem_tenantId_createdAt_id_idx"
ON "InventoryItem"("tenantId", "createdAt", "id");

CREATE INDEX "InventoryMovement_tenantId_createdAt_id_idx"
ON "InventoryMovement"("tenantId", "createdAt", "id");

CREATE INDEX "InventoryMovement_tenantId_warehouseId_createdAt_id_idx"
ON "InventoryMovement"("tenantId", "warehouseId", "createdAt", "id");

CREATE INDEX "InventoryMovement_tenantId_inventoryItemId_createdAt_id_idx"
ON "InventoryMovement"("tenantId", "inventoryItemId", "createdAt", "id");
