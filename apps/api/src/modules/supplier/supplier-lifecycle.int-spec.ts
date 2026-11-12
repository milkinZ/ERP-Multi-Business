import { InventoryItemType, PrismaClient } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { SupplierRepository } from './supplier.repository';
import { SupplierService } from './supplier.service';

const prisma = new PrismaClient();
const service = new SupplierService(new SupplierRepository(prisma as never));

const tenantId = 'it-supplier-lifecycle-tenant';
const referencedSupplierId = 'it-supplier-lifecycle-referenced';
const unusedSupplierId = 'it-supplier-lifecycle-unused';
const offerSupplierId = 'it-supplier-lifecycle-offer-supplier';
const purchaseOrderId = 'it-supplier-lifecycle-po';
const inventoryItemId = 'it-supplier-lifecycle-item';
let profileSupplierId: string | undefined;

async function cleanup() {
  if (profileSupplierId) {
    await prisma.supplier.deleteMany({ where: { id: profileSupplierId } });
    profileSupplierId = undefined;
  }
  await prisma.purchaseOrder.deleteMany({
    where: { id: purchaseOrderId },
  });
  await prisma.supplierItemOffer.deleteMany({
    where: { tenantId },
  });
  await prisma.supplier.deleteMany({
    where: {
      id: { in: [referencedSupplierId, unusedSupplierId, offerSupplierId] },
    },
  });
  await prisma.inventoryItem.deleteMany({ where: { id: inventoryItemId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

describe('Supplier lifecycle PostgreSQL integration', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await cleanup();
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: 'Supplier Lifecycle Tenant',
        currencyCode: 'IDR',
      },
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
        {
          id: offerSupplierId,
          tenantId,
          name: 'Offer lifecycle supplier',
        },
      ],
    });
    await prisma.inventoryItem.create({
      data: {
        id: inventoryItemId,
        tenantId,
        code: 'IT-SUPPLIER-OFFER',
        name: 'Supplier offer test item',
        type: InventoryItemType.MATERIAL,
        unit: 'kg',
      },
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

  it('keeps dated offer history non-overlapping in the tenant base currency', async () => {
    const first = await service.createOffer(offerSupplierId, tenantId, {
      inventoryItemId,
      supplierSku: 'ACME-001',
      unit: 'kg',
      unitPrice: 12.5,
      minimumOrderQuantity: 2,
      leadTimeDays: 3,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
    });
    expect(first).toMatchObject({
      supplierId: offerSupplierId,
      inventoryItemId,
      supplierSku: 'ACME-001',
      unit: 'kg',
      currencyCode: 'IDR',
      effectiveTo: null,
    });

    await service.closeOffer(
      offerSupplierId,
      first.id,
      tenantId,
      '2026-05-01T00:00:00.000Z',
    );
    const second = await service.createOffer(offerSupplierId, tenantId, {
      inventoryItemId,
      unit: 'kg',
      unitPrice: 15,
      effectiveFrom: '2026-05-01T00:00:00.000Z',
    });
    expect(second.effectiveFrom.toISOString()).toBe('2026-05-01T00:00:00.000Z');

    await expect(
      service.createOffer(offerSupplierId, tenantId, {
        inventoryItemId,
        unit: 'kg',
        unitPrice: 14,
        effectiveFrom: '2026-04-15T00:00:00.000Z',
      }),
    ).rejects.toThrow('cannot have overlapping effective dates');

    await expect(
      service.findOffers(offerSupplierId, tenantId, {
        skip: 0,
        take: 20,
        inventoryItemId,
      }),
    ).resolves.toMatchObject({
      data: [
        expect.objectContaining({ id: second.id }),
        expect.objectContaining({
          id: first.id,
          effectiveTo: new Date('2026-05-01T00:00:00.000Z'),
        }),
      ],
      pagination: { total: 2, hasMore: false },
    });

    await expect(service.remove(offerSupplierId, tenantId)).resolves.toEqual({
      success: true,
      deactivated: true,
    });
  });

  it('persists, updates, and searches supplier contact and tax details', async () => {
    const supplier = await service.create(tenantId, {
      name: 'Profile lifecycle supplier',
      contactPerson: 'Ada Lovelace',
      taxNumber: 'TAX-123',
    });
    profileSupplierId = supplier.id;

    await expect(
      prisma.supplier.findUnique({ where: { id: supplier.id } }),
    ).resolves.toMatchObject({
      contactPerson: 'Ada Lovelace',
      taxNumber: 'TAX-123',
    });

    await service.update(supplier.id, tenantId, {
      contactPerson: 'Grace Hopper',
      taxNumber: 'TAX-456',
    });

    await expect(
      service.findAll(tenantId, { page: 1, limit: 20, search: 'TAX-456' }),
    ).resolves.toMatchObject({
      data: [
        expect.objectContaining({
          id: supplier.id,
          contactPerson: 'Grace Hopper',
          taxNumber: 'TAX-456',
        }),
      ],
      pagination: { total: 1 },
    });

    await service.update(supplier.id, tenantId, {
      contactPerson: '',
      taxNumber: '',
    });
    await expect(
      prisma.supplier.findUnique({ where: { id: supplier.id } }),
    ).resolves.toMatchObject({ contactPerson: null, taxNumber: null });
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
