import { PrismaClient } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { SupplierRepository } from './supplier.repository';
import { SupplierService } from './supplier.service';

const prisma = new PrismaClient();
const service = new SupplierService(new SupplierRepository(prisma as never));

const tenantId = 'it-supplier-lifecycle-tenant';
const referencedSupplierId = 'it-supplier-lifecycle-referenced';
const unusedSupplierId = 'it-supplier-lifecycle-unused';
const purchaseOrderId = 'it-supplier-lifecycle-po';

async function cleanup() {
  await prisma.purchaseOrder.deleteMany({
    where: { id: purchaseOrderId },
  });
  await prisma.supplier.deleteMany({
    where: { id: { in: [referencedSupplierId, unusedSupplierId] } },
  });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

describe('Supplier lifecycle PostgreSQL integration', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await cleanup();
    await prisma.tenant.create({
      data: { id: tenantId, name: 'Supplier Lifecycle Tenant' },
    });
    await prisma.supplier.createMany({
      data: [
        {
          id: referencedSupplierId,
          tenantId,
          name: 'Referenced lifecycle supplier',
        },
        {
          id: unusedSupplierId,
          tenantId,
          name: 'Unused lifecycle supplier',
        },
      ],
    });
    await prisma.purchaseOrder.create({
      data: {
        id: purchaseOrderId,
        tenantId,
        supplierId: referencedSupplierId,
        poNumber: 'IT-SUPPLIER-LIFECYCLE',
        totalAmount: 0,
        updatedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('deactivates a referenced supplier and preserves its Purchase Order', async () => {
    await expect(
      service.remove(referencedSupplierId, tenantId),
    ).resolves.toEqual({ success: true, deactivated: true });
    await expect(
      prisma.supplier.findUnique({ where: { id: referencedSupplierId } }),
    ).resolves.toMatchObject({ isActive: false });
    await expect(
      prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId } }),
    ).resolves.toMatchObject({ supplierId: referencedSupplierId });
  });

  it('hard-deletes a supplier with no Purchase Order references', async () => {
    await expect(service.remove(unusedSupplierId, tenantId)).resolves.toEqual({
      success: true,
      deactivated: false,
    });
    await expect(
      prisma.supplier.findUnique({ where: { id: unusedSupplierId } }),
    ).resolves.toBeNull();
  });
});
