export class PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  inventoryItemId: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  receivedQuantity: number;
}
