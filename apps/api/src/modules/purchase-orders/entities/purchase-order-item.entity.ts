import { PurchaseOrderItem as PrismaPurchaseOrderItem } from '@prisma/client';

export class PurchaseOrderItem implements PrismaPurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  inventoryItemId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  receivedQuantity: number;
}
