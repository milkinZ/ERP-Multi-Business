import { PrismaClient } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import {
  ACTIVE_RESERVATION_REF,
  EXPIRED_RESERVATION_REF,
  RELEASE_MOVEMENT_REF,
  ReservationRepository,
} from './reservation.repository';

const prisma = new PrismaClient();
const repository = new ReservationRepository(prisma as never);
const tenantId = 'it-expiry-tenant';
const warehouseId = 'it-expiry-warehouse';
const itemId = 'it-expiry-item';
const reservationId = 'it-expiry-reservation';

async function cleanup() {
  await prisma.outboxEvent.deleteMany({
    where: { type: { in: ['inventory.reservation.expired'] } },
  });
  await prisma.inventoryMovement.deleteMany({
    where: { inventoryItemId: itemId },
  });
  await prisma.inventoryStock.deleteMany({
    where: { inventoryItemId: itemId },
  });
  await prisma.inventoryItem.deleteMany({ where: { id: itemId } });
  await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

describe('Reservation expiry business idempotency', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await cleanup();
    await prisma.tenant.create({
      data: { id: tenantId, name: 'Expiry Tenant', businessType: 'RETAIL' },
    });
    await prisma.warehouse.create({
      data: {
        id: warehouseId,
        name: 'Expiry Warehouse',
        code: 'EXPIRY',
        tenantId,
      },
    });
    await prisma.inventoryItem.create({
      data: {
        id: itemId,
        code: 'EXPIRY-ITEM',
        name: 'Expiry Item',
        type: 'PRODUCT',
        tenantId,
      },
    });
    await prisma.inventoryStock.create({
      data: {
        warehouseId,
        inventoryItemId: itemId,
        quantity: 0,
        updatedAt: new Date(),
      },
    });
  });

  beforeEach(async () => {
    await prisma.inventoryMovement.deleteMany({
      where: { inventoryItemId: itemId },
    });
    await prisma.inventoryStock.update({
      where: {
        warehouseId_inventoryItemId: { warehouseId, inventoryItemId: itemId },
      },
      data: { quantity: 0 },
    });
    await prisma.inventoryMovement.create({
      data: {
        id: reservationId,
        tenantId,
        warehouseId,
        inventoryItemId: itemId,
        type: 'STOCK_OUT',
        quantity: 5,
        beforeQuantity: 5,
        afterQuantity: 0,
        referenceType: ACTIVE_RESERVATION_REF,
        referenceId: 'logical-order-expiry',
        createdAt: new Date('2020-01-01T00:00:00Z'),
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('applies one release movement for concurrent duplicate expiry execution', async () => {
    const results = await Promise.allSettled([
      repository.expireReservations(new Date('2021-01-01T00:00:00Z')),
      repository.expireReservations(new Date('2021-01-01T00:00:00Z')),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<number> =>
        result.status === 'fulfilled',
    );
    expect(fulfilled).toHaveLength(2);
    expect(fulfilled.map((result) => result.value).sort()).toEqual([0, 1]);
    await expect(
      prisma.inventoryStock.findUnique({
        where: {
          warehouseId_inventoryItemId: { warehouseId, inventoryItemId: itemId },
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ quantity: 5 }));
    await expect(
      prisma.inventoryMovement.count({
        where: { inventoryItemId: itemId, referenceType: RELEASE_MOVEMENT_REF },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.inventoryMovement.findUnique({ where: { id: reservationId } }),
    ).resolves.toEqual(
      expect.objectContaining({ referenceType: EXPIRED_RESERVATION_REF }),
    );
  });
});
