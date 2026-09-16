import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import jwt from 'jsonwebtoken';

import { AppModule } from '../src/app.module';
import { SocketRedisAdapterProvider } from '../src/infrastructure/websocket/redis/socket-redis-adapter.provider';
import { RedisIoAdapter } from '../src/infrastructure/websocket/redis/redis-io.adapter';
import { PERMISSIONS } from '../src/modules/rbac/permissions';

const prisma = new PrismaClient();
const tenantA = 'e2e-isolation-tenant-a';
const tenantB = 'e2e-isolation-tenant-b';
const outletA = 'e2e-isolation-outlet-a';
const outletB = 'e2e-isolation-outlet-b';
const productA = 'e2e-isolation-product-a';
const productB = 'e2e-isolation-product-b';
const orderA = 'e2e-isolation-order-a';
const orderB = 'e2e-isolation-order-b';
const invoiceA = 'e2e-isolation-invoice-a';
const auditA = 'e2e-isolation-audit-a';

const permissions = [
  PERMISSIONS.PRODUCT_READ,
  PERMISSIONS.ORDER_READ,
  PERMISSIONS.INVOICE_READ,
];

async function cleanup() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog"');
  await prisma.invoice.deleteMany({ where: { id: invoiceA } });
  await prisma.salesOrderItem.deleteMany({
    where: { orderId: { in: [orderA, orderB] } },
  });
  await prisma.salesOrder.deleteMany({
    where: { id: { in: [orderA, orderB] } },
  });
  await prisma.product.deleteMany({
    where: { id: { in: [productA, productB] } },
  });
  await prisma.outlet.deleteMany({
    where: { id: { in: [outletA, outletB] } },
  });
  await prisma.tenant.deleteMany({
    where: { id: { in: [tenantA, tenantB] } },
  });
}

describe('HTTP tenant isolation matrix', () => {
  let app: INestApplication<App>;
  const secret = process.env.JWT_SECRET ?? '';

  const tokenFor = (tenantId: string, outletId: string) =>
    jwt.sign(
      {
        sub: `e2e-isolation-user-${tenantId}`,
        tenantId,
        outletId,
        permissions,
        roles: [],
      },
      secret,
    );

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: 'Isolation Tenant A', businessType: 'RETAIL' },
        { id: tenantB, name: 'Isolation Tenant B', businessType: 'RETAIL' },
      ],
    });
    await prisma.outlet.createMany({
      data: [
        { id: outletA, name: 'Isolation Outlet A', tenantId: tenantA },
        { id: outletB, name: 'Isolation Outlet B', tenantId: tenantB },
      ],
    });
    await prisma.product.createMany({
      data: [
        {
          id: productA,
          name: 'Tenant A Product',
          sku: 'E2E-ISOLATION-A',
          price: 100,
          tenantId: tenantA,
        },
        {
          id: productB,
          name: 'Tenant B Product',
          sku: 'E2E-ISOLATION-B',
          price: 200,
          tenantId: tenantB,
        },
      ],
    });
    await prisma.salesOrder.create({
      data: {
        id: orderA,
        orderNumber: 'E2E-ISOLATION-ORDER-A',
        tenantId: tenantA,
        outletId: outletA,
        totalAmount: 100,
        SalesOrderItem: {
          create: {
            productId: productA,
            quantity: 1,
            price: 100,
            subtotal: 100,
          },
        },
      },
    });
    await prisma.salesOrder.create({
      data: {
        id: orderB,
        orderNumber: 'E2E-ISOLATION-ORDER-B',
        tenantId: tenantB,
        outletId: outletB,
        totalAmount: 200,
        SalesOrderItem: {
          create: {
            productId: productB,
            quantity: 1,
            price: 200,
            subtotal: 200,
          },
        },
      },
    });
    await prisma.invoice.create({
      data: {
        id: invoiceA,
        invoiceNumber: 'E2E-ISOLATION-INVOICE-A',
        tenantId: tenantA,
        amountCents: 1000,
      },
    });
    await prisma.auditLog.create({
      data: {
        id: auditA,
        tenantId: tenantA,
        outletId: outletA,
        entity: 'Order',
        entityId: orderA,
        action: 'CREATE',
        metadata: { source: 'e2e' },
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
    if (app) await app.close();
    await cleanup();
    await prisma.$disconnect();
  });

  it('isolates product detail and list reads by tenant', async () => {
    const tenantAToken = tokenFor(tenantA, outletA);
    const tenantBToken = tokenFor(tenantB, outletB);

    await request(app.getHttpServer())
      .get(`/products/${productA}`)
      .set('Authorization', `Bearer ${tenantAToken}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.props).toEqual(expect.objectContaining({ id: productA })),
      );

    await request(app.getHttpServer())
      .get(`/products/${productA}`)
      .set('Authorization', `Bearer ${tenantBToken}`)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({}));

    await request(app.getHttpServer())
      .get('/products')
      .set('Authorization', `Bearer ${tenantBToken}`)
      .expect(200)
      .expect(({ body }) => {
        const ids = body.map((product: { id?: string }) => product.id);
        expect(ids).toContain(productB);
        expect(ids).not.toContain(productA);
      });
  });

  it('isolates sales order detail and list reads by tenant', async () => {
    const tenantAToken = tokenFor(tenantA, outletA);
    const tenantBToken = tokenFor(tenantB, outletB);

    await request(app.getHttpServer())
      .get(`/salesOrders/${orderA}`)
      .set('Authorization', `Bearer ${tenantAToken}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toEqual(expect.objectContaining({ id: orderA })),
      );

    await request(app.getHttpServer())
      .get(`/salesOrders/${orderA}`)
      .set('Authorization', `Bearer ${tenantBToken}`)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({}));

    await request(app.getHttpServer())
      .get('/salesOrders')
      .set('Authorization', `Bearer ${tenantBToken}`)
      .expect(200)
      .expect(({ body }) => {
        const ids = body.map(
          (order: { id?: string }) => order.id,
        );
        expect(ids).toContain(orderB);
        expect(ids).not.toContain(orderA);
      });
  });

  it('rejects cross-tenant invoice and audit-log detail reads', async () => {
    const tenantAToken = tokenFor(tenantA, outletA);
    const tenantBToken = tokenFor(tenantB, outletB);

    await request(app.getHttpServer())
      .get(`/billing/invoices/${invoiceA}`)
      .set('Authorization', `Bearer ${tenantAToken}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toEqual(expect.objectContaining({ id: invoiceA })),
      );

    await request(app.getHttpServer())
      .get(`/billing/invoices/${invoiceA}`)
      .set('Authorization', `Bearer ${tenantBToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/audit-logs/${auditA}`)
      .set('Authorization', `Bearer ${tenantAToken}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.data).toEqual(expect.objectContaining({ id: auditA })),
      );

    await request(app.getHttpServer())
      .get(`/audit-logs/${auditA}`)
      .set('Authorization', `Bearer ${tenantBToken}`)
      .expect(400);
  });
});
