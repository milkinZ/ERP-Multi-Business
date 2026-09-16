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
const tenantA = 'e2e-resource-tenant-a';
const tenantB = 'e2e-resource-tenant-b';
const productA = 'e2e-resource-product-a';
const productB = 'e2e-resource-product-b';
const supplierA = 'e2e-resource-supplier-a';
const supplierB = 'e2e-resource-supplier-b';
const warehouseA = 'e2e-resource-warehouse-a';
const warehouseB = 'e2e-resource-warehouse-b';
const orderA = 'e2e-resource-order-a';
const orderB = 'e2e-resource-order-b';
const paymentA = 'e2e-resource-payment-a';

const permissions = Object.values(PERMISSIONS);

async function cleanup() {
  await prisma.payment.deleteMany({ where: { id: paymentA } });
  await prisma.salesOrderItem.deleteMany({ where: { orderId: { in: [orderA, orderB] } } });
  await prisma.salesOrder.deleteMany({ where: { id: { in: [orderA, orderB] } } });
  await prisma.warehouse.deleteMany({ where: { id: { in: [warehouseA, warehouseB] } } });
  await prisma.supplier.deleteMany({ where: { id: { in: [supplierA, supplierB] } } });
  await prisma.product.deleteMany({ where: { id: { in: [productA, productB] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
}

describe('Remaining HTTP tenant isolation resources', () => {
  let app: INestApplication<App>;
  const secret = process.env.JWT_SECRET ?? '';
  const tokenFor = (tenantId: string) => jwt.sign({ sub: `resource-user-${tenantId}`, tenantId, permissions, roles: [], outlets: [] }, secret);

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    await prisma.tenant.createMany({ data: [
      { id: tenantA, name: 'Resource Tenant A', businessType: 'RETAIL' },
      { id: tenantB, name: 'Resource Tenant B', businessType: 'RETAIL' },
    ] });
    await prisma.product.createMany({ data: [
      { id: productA, name: 'Resource Product A', sku: 'RESOURCE-A', price: 100, tenantId: tenantA },
      { id: productB, name: 'Resource Product B', sku: 'RESOURCE-B', price: 200, tenantId: tenantB },
    ] });
    await prisma.supplier.createMany({ data: [
      { id: supplierA, name: 'Supplier A', tenantId: tenantA },
      { id: supplierB, name: 'Supplier B', tenantId: tenantB },
    ] });
    await prisma.warehouse.createMany({ data: [
      { id: warehouseA, name: 'Warehouse A', code: 'RESOURCE-W-A', tenantId: tenantA },
      { id: warehouseB, name: 'Warehouse B', code: 'RESOURCE-W-B', tenantId: tenantB },
    ] });
    await prisma.salesOrder.create({ data: {
      id: orderA, orderNumber: 'RESOURCE-ORDER-A', tenantId: tenantA, totalAmount: 100,
      SalesOrderItem: { create: { productId: productA, quantity: 1, price: 100, subtotal: 100 } },
    } });
    await prisma.salesOrder.create({ data: {
      id: orderB, orderNumber: 'RESOURCE-ORDER-B', tenantId: tenantB, totalAmount: 200,
      SalesOrderItem: { create: { productId: productB, quantity: 1, price: 200, subtotal: 200 } },
    } });

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

  it('protects supplier list/detail/update/delete across tenants', async () => {
    const a = tokenFor(tenantA);
    const b = tokenFor(tenantB);

    await request(app.getHttpServer()).get('/suppliers').set('Authorization', `Bearer ${a}`).expect(200).expect(({ body }) => expect(body.map((row: { id: string }) => row.id)).toEqual([supplierA]));
    await request(app.getHttpServer()).get(`/suppliers/${supplierB}`).set('Authorization', `Bearer ${a}`).expect(400);
    await request(app.getHttpServer()).patch(`/suppliers/${supplierB}`).set('Authorization', `Bearer ${a}`).send({ name: 'Hijacked' }).expect(400);
    await request(app.getHttpServer()).delete(`/suppliers/${supplierB}`).set('Authorization', `Bearer ${a}`).expect(400);
    await expect(prisma.supplier.findUnique({ where: { id: supplierB } })).resolves.toEqual(expect.objectContaining({ name: 'Supplier B', tenantId: tenantB }));
    await request(app.getHttpServer()).get(`/suppliers/${supplierB}`).set('Authorization', `Bearer ${b}`).expect(200);
  });

  it('protects warehouse collection and detail reads across tenants', async () => {
    const a = tokenFor(tenantA);
    const b = tokenFor(tenantB);

    await request(app.getHttpServer()).get('/warehouses').set('Authorization', `Bearer ${a}`).expect(200).expect(({ body }) => expect(body.map((row: { id: string }) => row.id)).toEqual([warehouseA]));
    await request(app.getHttpServer()).get(`/warehouses/${warehouseB}`).set('Authorization', `Bearer ${a}`).expect(400);
    await request(app.getHttpServer()).get(`/warehouses/${warehouseB}`).set('Authorization', `Bearer ${b}`).expect(200);
  });

  it('protects payment list/detail and rejects cross-tenant payment attempts', async () => {
    const a = tokenFor(tenantA);
    const b = tokenFor(tenantB);

    await request(app.getHttpServer()).post('/payments/pay').set('Authorization', `Bearer ${a}`).send({ orderId: orderB, amount: 200, method: 'CASH' }).expect(400);
    await request(app.getHttpServer()).post('/payments/pay').set('Authorization', `Bearer ${a}`).send({ orderId: orderA, amount: 100, method: 'CASH' }).expect(201).expect(({ body }) => expect(body.tenantId).toBe(tenantA));
    const payment = await prisma.payment.findFirst({ where: { orderId: orderA } });
    expect(payment).not.toBeNull();
    if (!payment) throw new Error('Expected payment fixture');
    await prisma.payment.update({ where: { id: payment.id }, data: { id: paymentA } });

    await request(app.getHttpServer()).get('/payments').set('Authorization', `Bearer ${b}`).expect(200).expect(({ body }) => expect(body).toEqual([]));
    await request(app.getHttpServer()).get(`/payments/${paymentA}`).set('Authorization', `Bearer ${b}`).expect(400);
    await expect(prisma.payment.findUnique({ where: { id: paymentA } })).resolves.toEqual(expect.objectContaining({ tenantId: tenantA }));
  });
});
