import {
  PurchaseOrder as PrismaPurchaseOrder,
  PurchaseOrderStatus,
} from '@prisma/client';

export class PurchaseOrder implements PrismaPurchaseOrder {
  id: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  supplierId: string;
  tenantId: string;
  warehouseId: string | null;
  expectedDeliveryDate: Date | null;
  totalAmount: number;
  notes: string | null;
  receivedAt: Date | null;
  completedAt: Date | null;
  createdById: string | null;
  updatedById: string | null;
  deletedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
