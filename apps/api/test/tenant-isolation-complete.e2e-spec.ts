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
const userB = 'e2e-matrix-user-b';
const productA = 'e2e-matrix-product-a';
const productB = 'e2e-matrix-product-b';
const ingredientA = 'e2e-matrix-ingredient-a';
const ingredientB = 'e2e-matrix-ingredient-b';
const inventoryItemA = 'e2e-matrix-inventory-a';
const inventoryItemB = 'e2e-matrix-inventory-b';
const warehouseA = 'e2e-matrix-warehouse-a';
const warehouseB = 'e2e-matrix-warehouse-b';
const notificationA = 'e2e-matrix-notification-a';
const notificationB = 'e2e-matrix-notification-b';
const roleA = 'e2e-matrix-role-a';
const roleB = 'e2e-matrix-role-b';
const recipeA = 'e2e-matrix-recipe-a';

const permissions = Object.values(PERMISSIONS);

async function cleanup() {
  await prisma.inventoryMovement.deleteMany({
    where: { inventoryItemId: { in: [inventoryItemA, inventoryItemB] } },
  });
  await prisma.recipeItem.deleteMany({ where: { recipeId: recipeA } });
  await prisma.recipe.deleteMany({ where: { id: recipeA } });
  await prisma.notification.deleteMany({ where: { id: { in: [notificationA, notificationB] } } });
  await prisma.role.deleteMany({ where: { id: { in: [roleA, roleB] } } });
  await prisma.inventoryStock.deleteMany({ where: { inventoryItemId: { in: [inventoryItemA, inventoryItemB] } } });
  await prisma.warehouse.deleteMany({ where: { id: { in: [warehouseA, warehouseB] } } });
  await prisma.ingredient.deleteMany({ where: { id: { in: [ingredientA, ingredientB] } } });
  await prisma.product.deleteMany({ where: { id: { in: [productA, productB] } } });
  await prisma.inventoryItem.deleteMany({ where: { id: { in: [inventoryItemA, inventoryItemB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
}

describe('Complete HTTP tenant isolation matrix', () => {
  let app: INestApplication<App>;
  const secret = process.env.JWT_SECRET ?? '';

  const tokenFor = (tenantId: string, userId: string) =>
    jwt.sign({ sub: userId, tenantId, permissions, roles: [], outlets: [] }, secret);

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
        { id: userA, email: 'matrix-a@example.test', password: 'hash', tenantId: tenantA },
        { id: userB, email: 'matrix-b@example.test', password: 'hash', tenantId: tenantB },
      ],
    });
    await prisma.inventoryItem.createMany({
      data: [
        { id: inventoryItemA, code: 'MATRIX-INV-A', name: 'Ingredient A Stock', type: 'INGREDIENT', tenantId: tenantA },
        { id: inventoryItemB, code: 'MATRIX-INV-B', name: 'Ingredient B Stock', type: 'INGREDIENT', tenantId: tenantB },
      ],
    });
    await prisma.ingredient.createMany({
      data: [
        { id: ingredientA, name: 'Ingredient A', unit: 'kg', tenantId: tenantA, inventoryItemId: inventoryItemA },
        { id: ingredientB, name: 'Ingredient B', unit: 'kg', tenantId: tenantB, inventoryItemId: inventoryItemB },
      ],
    });
    await prisma.product.createMany({
      data: [
        { id: productA, name: 'Matrix Product A', sku: 'MATRIX-A', price: 100, tenantId: tenantA },
        { id: productB, name: 'Matrix Product B', sku: 'MATRIX-B', price: 200, tenantId: tenantB },
      ],
    });
    await prisma.warehouse.createMany({
      data: [
        { id: warehouseA, name: 'Matrix Warehouse A', code: 'MATRIX-W-A', tenantId: tenantA },
        { id: warehouseB, name: 'Matrix Warehouse B', code: 'MATRIX-W-B', tenantId: tenantB },
      ],
    });
    await prisma.inventoryStock.createMany({
      data: [
        { warehouseId: warehouseA, inventoryItemId: inventoryItemA, quantity: 10, updatedAt: new Date() },
        { warehouseId: warehouseB, inventoryItemId: inventoryItemB, quantity: 20, updatedAt: new Date() },
      ],
    });
    await prisma.notification.createMany({
      data: [
        { id: notificationA, tenantId: tenantA, userId: userA, type: 'TEST', title: 'A', message: 'A' },
        { id: notificationB, tenantId: tenantB, userId: userB, type: 'TEST', title: 'B', message: 'B' },
      ],
    });
    await prisma.role.createMany({
      data: [
        { id: roleA, tenantId: tenantA, name: 'Role A' },
        { id: roleB, tenantId: tenantB, name: 'Role B' },
      ],
    });
    await prisma.recipe.create({
      data: {
        id: recipeA,
        tenantId: tenantA,
        productId: productA,
        RecipeItem: { create: { ingredientId: ingredientA, quantity: 2 } },
      },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

    await request(app.getHttpServer()).get('/inventory/items').set('Authorization', `Bearer ${a}`).expect(200).expect(({ body }) => {
      expect(body.map((item: { id: string }) => item.id)).toEqual([inventoryItemA]);
    });
    await request(app.getHttpServer()).get(`/inventory/history/${inventoryItemB}`).set('Authorization', `Bearer ${a}`).expect(200).expect(({ body }) => expect(body).toEqual([]));
    await request(app.getHttpServer()).post('/inventory/stock-in').set('Authorization', `Bearer ${a}`).send({ inventoryItemId: inventoryItemB, warehouseId: warehouseB, quantity: 5 }).expect(400);
    await request(app.getHttpServer()).get('/inventory/items').set('Authorization', `Bearer ${b}`).expect(200).expect(({ body }) => expect(body.map((item: { id: string }) => item.id)).toEqual([inventoryItemB]));
  });

  it('isolates ingredients and rejects cross-tenant recipe references', async () => {
    const a = tokenFor(tenantA, userA);
    const b = tokenFor(tenantB, userB);

    await request(app.getHttpServer()).get('/ingredients').set('Authorization', `Bearer ${a}`).expect(200).expect(({ body }) => expect(body.map((item: { id: string }) => item.id)).toEqual([ingredientA]));
    await request(app.getHttpServer()).get(`/ingredients/${ingredientB}`).set('Authorization', `Bearer ${a}`).expect(200).expect(({ body }) => expect(body).toEqual({}));
    await request(app.getHttpServer()).post('/recipes').set('Authorization', `Bearer ${a}`).send({ productId: productB, items: [{ ingredientId: ingredientA, quantity: 1 }] }).expect(400);
    await request(app.getHttpServer()).get(`/recipes/${productA}`).set('Authorization', `Bearer ${b}`).expect(200).expect(({ body }) => expect(body).toEqual({}));
  });

  it('isolates notifications and prevents cross-tenant read, mark, and delete operations', async () => {
    const a = tokenFor(tenantA, userA);
    const b = tokenFor(tenantB, userB);

    await request(app.getHttpServer()).get('/notifications').set('Authorization', `Bearer ${a}`).expect(200).expect(({ body }) => {
      expect(body.data.map((item: { id: string }) => item.id)).toEqual([notificationA]);
    });
    await request(app.getHttpServer()).put(`/notifications/${notificationB}/read`).set('Authorization', `Bearer ${a}`).expect(400);
    await request(app.getHttpServer()).delete(`/notifications/${notificationB}`).set('Authorization', `Bearer ${a}`).expect(400);
    await request(app.getHttpServer()).delete(`/notifications/${notificationB}`).set('Authorization', `Bearer ${b}`).expect(200);
    await expect(prisma.notification.findUnique({ where: { id: notificationB } })).resolves.toEqual(expect.objectContaining({ deletedAt: expect.any(Date) }));
  });

  it('isolates roles at the HTTP boundary for list, detail, update, and delete', async () => {
    const a = tokenFor(tenantA, userA);
    const b = tokenFor(tenantB, userB);

    await request(app.getHttpServer()).get('/roles').set('Authorization', `Bearer ${a}`).expect(200).expect(({ body }) => expect(body.map((role: { id: string }) => role.id)).toEqual([roleA]));
    await request(app.getHttpServer()).get(`/roles/${roleB}`).set('Authorization', `Bearer ${a}`).expect(404);
    await request(app.getHttpServer()).put(`/roles/${roleB}`).set('Authorization', `Bearer ${a}`).send({ name: 'Hijacked' }).expect(404);
    await request(app.getHttpServer()).delete(`/roles/${roleB}`).set('Authorization', `Bearer ${a}`).expect(404);
    await expect(prisma.role.findUnique({ where: { id: roleB } })).resolves.toEqual(expect.objectContaining({ name: 'Role B', tenantId: tenantB }));
    await request(app.getHttpServer()).get(`/roles/${roleB}`).set('Authorization', `Bearer ${b}`).expect(200);
  });
});
