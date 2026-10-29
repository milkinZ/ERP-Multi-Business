import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { SocketRedisAdapterProvider } from '../src/infrastructure/websocket/redis/socket-redis-adapter.provider';
import { RedisIoAdapter } from '../src/infrastructure/websocket/redis/redis-io.adapter';
import { PERMISSIONS } from '../src/modules/rbac/permissions';

const prisma = new PrismaClient();
const tenantA = 'e2e-matrix-tenant-a';
const tenantB = 'e2e-matrix-tenant-b';
const userA = 'e2e-matrix-user-a';
const userAOther = 'e2e-matrix-user-a-other';
const userB = 'e2e-matrix-user-b';
const outletA = 'e2e-matrix-outlet-a';
const outletB = 'e2e-matrix-outlet-b';
const productA = 'e2e-matrix-product-a';
const productB = 'e2e-matrix-product-b';
const inventoryItemA = 'e2e-matrix-inventory-a';
const inventoryItemB = 'e2e-matrix-inventory-b';
const warehouseA = 'e2e-matrix-warehouse-a';
const warehouseB = 'e2e-matrix-warehouse-b';
const notificationA = 'e2e-matrix-notification-a';
const notificationAOther = 'e2e-matrix-notification-a-other';
const notificationB = 'e2e-matrix-notification-b';
const unauthenticatedWebhookPaymentId = 'e2e-matrix-unauthenticated-payment';
const roleA = 'e2e-matrix-role-a';
const roleB = 'e2e-matrix-role-b';
const recipeA = 'e2e-matrix-recipe-a';
const platformIdentityId = 'e2e-matrix-platform-identity';
const platformSessionId = 'e2e-matrix-platform-session';
const platformSessionTokenHash = 'e2e-matrix-platform-session-hash';

const permissions = Object.values(PERMISSIONS);

async function cleanup() {
  await prisma.inventoryReorderRule.deleteMany({
    where: { inventoryItemId: { in: [inventoryItemA, inventoryItemB] } },
  });
  await prisma.platformSession.deleteMany({
    where: { id: platformSessionId },
  });
  await prisma.platformIdentity.deleteMany({
    where: { id: platformIdentityId },
  });
  await prisma.xenditWebhookReceipt.deleteMany({
    where: { paymentId: unauthenticatedWebhookPaymentId },
  });
  await prisma.userRole.deleteMany({
    where: { userId: { in: [userA, userAOther, userB] } },
  });
  await prisma.userOutlet.deleteMany({
    where: { userId: { in: [userA, userAOther, userB] } },
  });
  await prisma.inventoryMovement.deleteMany({
    where: { inventoryItemId: { in: [inventoryItemA, inventoryItemB] } },
  });
  await prisma.recipeItem.deleteMany({ where: { recipeId: recipeA } });
  await prisma.recipe.deleteMany({ where: { id: recipeA } });
  await prisma.notification.deleteMany({
    where: { id: { in: [notificationA, notificationAOther, notificationB] } },
  });
  await prisma.role.deleteMany({ where: { id: { in: [roleA, roleB] } } });
  await prisma.outlet.deleteMany({ where: { id: { in: [outletA, outletB] } } });
  await prisma.inventoryStock.deleteMany({
    where: { inventoryItemId: { in: [inventoryItemA, inventoryItemB] } },
  });
  await prisma.warehouse.deleteMany({
    where: { id: { in: [warehouseA, warehouseB] } },
  });
  await prisma.product.deleteMany({
    where: { id: { in: [productA, productB] } },
  });
  await prisma.inventoryItem.deleteMany({
    where: { id: { in: [inventoryItemA, inventoryItemB] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [userA, userAOther, userB] } },
  });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
}

describe('Complete HTTP tenant isolation matrix', () => {
  let app: INestApplication<App>;
  const secret = process.env.JWT_SECRET ?? '';

  const tokenFor = (tenantId: string, userId: string) =>
    jwt.sign(
      {
        sub: userId,
        scope: 'tenant',
        tenantId,
        roleId: tenantId === tenantA ? roleA : roleB,
        permissions,
        roles: [],
        outlets: [],
      },
      secret,
    );
  const platformReaderToken = () =>
    jwt.sign(
      {
        sub: platformIdentityId,
        scope: 'platform',
        platformSessionId,
      },
      secret,
    );

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: 'Matrix Tenant A', businessType: 'RETAIL' },
        { id: tenantB, name: 'Matrix Tenant B', businessType: 'RETAIL' },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: userA,
          email: 'matrix-a@example.test',
          password: 'hash',
          tenantId: tenantA,
        },
        {
          id: userAOther,
          email: 'matrix-a-other@example.test',
          password: 'hash',
          tenantId: tenantA,
        },
        {
          id: userB,
          email: 'matrix-b@example.test',
          password: 'hash',
          tenantId: tenantB,
        },
      ],
    });
    await prisma.outlet.createMany({
      data: [
        { id: outletA, tenantId: tenantA, name: 'Outlet A' },
        { id: outletB, tenantId: tenantB, name: 'Outlet B' },
      ],
    });
    await prisma.inventoryItem.createMany({
      data: [
        {
          id: inventoryItemA,
          code: 'MATRIX-INV-A',
          name: 'Ingredient A Stock',
          type: 'INGREDIENT',
          tenantId: tenantA,
        },
        {
          id: inventoryItemB,
          code: 'MATRIX-INV-B',
          name: 'Ingredient B Stock',
          type: 'INGREDIENT',
          tenantId: tenantB,
        },
      ],
    });
    await prisma.product.createMany({
      data: [
        {
          id: productA,
          name: 'Matrix Product A',
          sku: 'MATRIX-A',
          price: 100,
          tenantId: tenantA,
        },
        {
          id: productB,
          name: 'Matrix Product B',
          sku: 'MATRIX-B',
          price: 200,
          tenantId: tenantB,
        },
      ],
    });
    await prisma.warehouse.createMany({
      data: [
        {
          id: warehouseA,
          name: 'Matrix Warehouse A',
          code: 'MATRIX-W-A',
          tenantId: tenantA,
        },
        {
          id: warehouseB,
          name: 'Matrix Warehouse B',
          code: 'MATRIX-W-B',
          tenantId: tenantB,
        },
      ],
    });
    await prisma.inventoryStock.createMany({
      data: [
        {
          warehouseId: warehouseA,
          inventoryItemId: inventoryItemA,
          quantity: 10,
          updatedAt: new Date(),
        },
        {
          warehouseId: warehouseB,
          inventoryItemId: inventoryItemB,
          quantity: 20,
          updatedAt: new Date(),
        },
      ],
    });
    await prisma.notification.createMany({
      data: [
        {
          id: notificationA,
          tenantId: tenantA,
          userId: userA,
          type: 'TEST',
          title: 'A',
          message: 'A',
        },
        {
          id: notificationAOther,
          tenantId: tenantA,
          userId: userAOther,
          type: 'TEST',
          title: 'A Other',
          message: 'A Other',
        },
        {
          id: notificationB,
          tenantId: tenantB,
          userId: userB,
          type: 'TEST',
          title: 'B',
          message: 'B',
        },
      ],
    });
    await prisma.role.createMany({
      data: [
        { id: roleA, tenantId: tenantA, name: 'Role A' },
        { id: roleB, tenantId: tenantB, name: 'Role B' },
      ],
    });
    await prisma.platformIdentity.create({
      data: {
        id: platformIdentityId,
        issuer: 'https://e2e.example.test',
        subject: 'matrix-platform-reader',
        role: 'READ_ONLY',
      },
    });
    await prisma.platformSession.create({
      data: {
        id: platformSessionId,
        identityId: platformIdentityId,
        tokenHash: platformSessionTokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await prisma.recipe.create({
      data: {
        id: recipeA,
        tenantId: tenantA,
        productId: productA,
        RecipeItem: {
          create: { inventoryItemId: inventoryItemA, quantity: 2 },
        },
      },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    const redisAdapterProvider = moduleFixture.get(SocketRedisAdapterProvider);
    app.useWebSocketAdapter(new RedisIoAdapter(app, redisAdapterProvider));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await cleanup();
    await prisma.$disconnect();
  });

  it('isolates inventory collections, item history, and cross-tenant stock mutations', async () => {
    const a = tokenFor(tenantA, userA);
    const b = tokenFor(tenantB, userB);

    await request(app.getHttpServer())
      .get('/inventory/items')
      .set('Authorization', `Bearer ${a}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.map((item: { id: string }) => item.id)).toEqual([
          inventoryItemA,
        ]);
      });
    await request(app.getHttpServer())
      .get(`/inventory/history/${inventoryItemB}`)
      .set('Authorization', `Bearer ${a}`)
      .expect(200)
      .expect(({ body }) => expect(body.data).toEqual([]));
    await request(app.getHttpServer())
      .post('/inventory/stock-in')
      .set('Authorization', `Bearer ${a}`)
      .send({
        inventoryItemId: inventoryItemB,
        warehouseId: warehouseB,
        quantity: 5,
      })
      .expect(400);
    await request(app.getHttpServer())
      .get('/inventory/items')
      .set('Authorization', `Bearer ${b}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.data.map((item: { id: string }) => item.id)).toEqual([
          inventoryItemB,
        ]),
      );
    await request(app.getHttpServer())
      .get(`/inventory/items/${inventoryItemA}/availability`)
      .set('Authorization', `Bearer ${a}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.totals).toEqual({
          availableQuantity: 10,
          reservedQuantity: 0,
          onHandQuantity: 10,
        }),
      );
    await request(app.getHttpServer())
      .get(`/inventory/items/${inventoryItemA}/availability`)
      .set('Authorization', `Bearer ${b}`)
      .expect(404);
  });

  it('isolates inventory reorder rules and validates warehouse ownership', async () => {
    const a = tokenFor(tenantA, userA);
    const b = tokenFor(tenantB, userB);
    const rule = {
      warehouseId: warehouseA,
      reorderPoint: 15,
      quantityStrategy: 'TARGET_STOCK',
      targetStock: 20,
    };

    await request(app.getHttpServer())
      .put(`/inventory/items/${inventoryItemA}/reorder-rules`)
      .set('Authorization', `Bearer ${a}`)
      .send({ scope: 'PER_WAREHOUSE', rules: [rule] })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({
          inventoryItemId: inventoryItemA,
          tenantId: tenantA,
          warehouseId: warehouseA,
          action: 'ALERT_AND_SUGGEST',
        });
      });
    await request(app.getHttpServer())
      .get(`/inventory/items/${inventoryItemA}/reorder-rules`)
      .set('Authorization', `Bearer ${a}`)
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(1));
    await request(app.getHttpServer())
      .get(`/inventory/items/${inventoryItemA}/reorder-rules`)
      .set('Authorization', `Bearer ${b}`)
      .expect(404);
    await request(app.getHttpServer())
      .put(`/inventory/items/${inventoryItemA}/reorder-rules`)
      .set('Authorization', `Bearer ${a}`)
      .send({
        scope: 'PER_WAREHOUSE',
        rules: [{ ...rule, warehouseId: warehouseB }],
      })
      .expect(400);

    await request(app.getHttpServer())
      .get(`/inventory/items/${inventoryItemA}/availability`)
      .set('Authorization', `Bearer ${a}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.balances).toContainEqual(
          expect.objectContaining({
            warehouseId: warehouseA,
            replenishment: expect.objectContaining({
              status: 'REORDER_REQUIRED',
              recommendedQuantity: 10,
            }),
          }),
        ),
      );
  });

  it('isolates ingredients and rejects cross-tenant recipe references', async () => {
    const a = tokenFor(tenantA, userA);
    const b = tokenFor(tenantB, userB);

    await request(app.getHttpServer())
      .get('/ingredients')
      .set('Authorization', `Bearer ${a}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.data.map((item: { id: string }) => item.id)).toEqual([
          inventoryItemA,
        ]),
      );
    await request(app.getHttpServer())
      .get(`/ingredients/${inventoryItemB}`)
      .set('Authorization', `Bearer ${a}`)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({}));
    await request(app.getHttpServer())
      .post('/recipes')
      .set('Authorization', `Bearer ${a}`)
      .send({
        productId: productA,
        items: [{ inventoryItemId: inventoryItemB, quantity: 1 }],
      })
      .expect(400);
    await request(app.getHttpServer())
      .get(`/recipes/${productA}`)
      .set('Authorization', `Bearer ${b}`)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({}));
  });

  it('isolates notifications and prevents cross-tenant read, mark, and delete operations', async () => {
    const a = tokenFor(tenantA, userA);
    const b = tokenFor(tenantB, userB);

    await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${a}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.map((item: { id: string }) => item.id)).toEqual([
          notificationA,
        ]);
      });
    await request(app.getHttpServer())
      .put(`/notifications/${notificationB}/read`)
      .set('Authorization', `Bearer ${a}`)
      .expect(400);
    await request(app.getHttpServer())
      .delete(`/notifications/${notificationB}`)
      .set('Authorization', `Bearer ${a}`)
      .expect(400);
    await request(app.getHttpServer())
      .delete(`/notifications/${notificationB}`)
      .set('Authorization', `Bearer ${b}`)
      .expect(200);
    await expect(
      prisma.notification.findUnique({ where: { id: notificationB } }),
    ).resolves.toEqual(
      expect.objectContaining({ deletedAt: expect.any(Date) }),
    );
  });

  it('prevents users from reading or deleting another user notification in the same tenant', async () => {
    const token = tokenFor(tenantA, userA);

    await request(app.getHttpServer())
      .put(`/notifications/${notificationAOther}/read`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(app.getHttpServer())
      .delete(`/notifications/${notificationAOther}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    await expect(
      prisma.notification.findUnique({ where: { id: notificationAOther } }),
    ).resolves.toEqual(
      expect.objectContaining({ readAt: null, deletedAt: null }),
    );
  });

  it('rejects cross-tenant user, role, and outlet IDs during assignment', async () => {
    const token = tokenFor(tenantA, userA);

    await prisma.userRole.create({
      data: { tenantId: tenantA, userId: userA, roleId: roleA },
    });
    await request(app.getHttpServer())
      .put(`/users/${userA}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roleIds: [roleB] })
      .expect(404);
    await request(app.getHttpServer())
      .put(`/users/${userB}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roleIds: [roleA] })
      .expect(404);

    await request(app.getHttpServer())
      .put(`/users/${userA}/outlets`)
      .set('Authorization', `Bearer ${token}`)
      .send({ outletIds: [outletB] })
      .expect(404);
    await request(app.getHttpServer())
      .put(`/users/${userB}/outlets`)
      .set('Authorization', `Bearer ${token}`)
      .send({ outletIds: [outletA] })
      .expect(404);

    await expect(
      prisma.userRole.findMany({ where: { userId: userA, deletedAt: null } }),
    ).resolves.toEqual([expect.objectContaining({ roleId: roleA })]);
    await expect(
      prisma.userOutlet.findMany({ where: { userId: userA, deletedAt: null } }),
    ).resolves.toEqual([]);
  });

  it('protects historical operational telemetry with the platform read permission', async () => {
    await request(app.getHttpServer())
      .get('/super-admin/operational/telemetry')
      .set('Authorization', `Bearer ${platformReaderToken()}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/super-admin/operational/telemetry')
      .set('Authorization', `Bearer ${tokenFor(tenantA, userA)}`)
      .expect(401);
  });

  it('protects platform tenant administration reads with super-admin.read', async () => {
    await request(app.getHttpServer())
      .get('/super-admin/tenants')
      .set('Authorization', `Bearer ${platformReaderToken()}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/super-admin/tenants')
      .set('Authorization', `Bearer ${tokenFor(tenantA, userA)}`)
      .expect(401);
  });

  it('rejects unauthenticated payment webhooks without persisting a receipt', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/payments')
      .set('x-callback-token', 'invalid-e2e-callback-token')
      .send({
        event: 'payment.capture',
        created: '2026-10-15T00:00:00.000Z',
        data: {
          payment_id: unauthenticatedWebhookPaymentId,
          payment_request_id: 'e2e-matrix-payment-request',
          reference_id: 'e2e-matrix-reference',
          request_amount: 1000,
          currency: 'IDR',
          status: 'SUCCEEDED',
          updated: '2026-10-15T00:00:01.000Z',
        },
      })
      .expect(401);

    await expect(
      prisma.xenditWebhookReceipt.count({
        where: { paymentId: unauthenticatedWebhookPaymentId },
      }),
    ).resolves.toBe(0);
  });

  it('isolates roles at the HTTP boundary for list, detail, update, and delete', async () => {
    const a = tokenFor(tenantA, userA);
    const b = tokenFor(tenantB, userB);

    await request(app.getHttpServer())
      .get('/roles')
      .set('Authorization', `Bearer ${a}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.map((role: { id: string }) => role.id)).toEqual([roleA]),
      );
    await request(app.getHttpServer())
      .get(`/roles/${roleB}`)
      .set('Authorization', `Bearer ${a}`)
      .expect(404);
    await request(app.getHttpServer())
      .put(`/roles/${roleB}`)
      .set('Authorization', `Bearer ${a}`)
      .send({ name: 'Hijacked' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/roles/${roleB}`)
      .set('Authorization', `Bearer ${a}`)
      .expect(404);
    await expect(
      prisma.role.findUnique({ where: { id: roleB } }),
    ).resolves.toEqual(
      expect.objectContaining({ name: 'Role B', tenantId: tenantB }),
    );
    await request(app.getHttpServer())
      .get(`/roles/${roleB}`)
      .set('Authorization', `Bearer ${b}`)
      .expect(200);
  });
});
