import { PlanType as PrismaPlanType, PrismaClient } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { OrdersRepository } from './orders.repository';
import { PaymentsRepository } from '../payments/payments.repository';
import { BillingRepository } from '../billing/billing.repository';
import { SubscriptionRepository } from '../subscription/domain/subscription.repository';
import { ProductsRepository } from '../products/products.repository';
import { Money } from '../../core/domain/value-objects/money';
import {
  SubscriptionAggregate,
  PlanType as DomainPlanType,
  SubscriptionStatus,
} from '../subscription/domain/subscription.aggregate';

const prisma = new PrismaClient();
const orders = new OrdersRepository(prisma as never);
const payments = new PaymentsRepository(prisma as never);
const billing = new BillingRepository(prisma as never);
const subscriptions = new SubscriptionRepository(prisma as never);
const products = new ProductsRepository(prisma as never);

const tenantA = 'it-orders-payments-tenant-a';
const tenantB = 'it-orders-payments-tenant-b';
const outletA = 'it-orders-payments-outlet-a';
const outletB = 'it-orders-payments-outlet-b';
const productA = 'it-orders-payments-product-a';
const productB = 'it-orders-payments-product-b';
const orderA = 'it-orders-payments-order-a';
const orderB = 'it-orders-payments-order-b';
const planId = 'it-orders-payments-plan';
const subscriptionA = 'it-orders-payments-subscription-a';
const invoiceA = 'it-orders-payments-invoice-a';

async function cleanup() {
  await prisma.outboxEvent.deleteMany({
    where: {
      type: {
        in: [
          'subscription.created',
          'subscription.activated',
          'invoice.created',
          'billing.payment.required',
          'invoice.paid',
          'invoice.failed',
        ],
      },
    },
  });
  await prisma.invoice.deleteMany({
    where: { id: invoiceA },
  });
  await prisma.subscription.deleteMany({
    where: { id: subscriptionA },
  });
  await prisma.payment.deleteMany({
    where: { orderId: { in: [orderA, orderB] } },
  });
  await prisma.salesOrderItem.deleteMany({
    where: { productId: { in: [productA, productB] } },
  });
  await prisma.salesOrderItem.deleteMany({
    where: { orderId: { in: [orderA, orderB] } },
  });
  await prisma.salesOrder.deleteMany({
    where: { tenantId: { in: [tenantA, tenantB] } },
  });
  await prisma.product.deleteMany({
    where: { id: { in: [productA, productB] } },
  });
  await prisma.outlet.deleteMany({
    where: { id: { in: [outletA, outletB] } },
  });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.tenant.deleteMany({
    where: { id: { in: [tenantA, tenantB] } },
  });
}

describe('Orders, payments, billing, and subscription integration', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await cleanup();
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: 'Orders Tenant A', businessType: 'RETAIL' },
        { id: tenantB, name: 'Orders Tenant B', businessType: 'RETAIL' },
      ],
    });
    await prisma.outlet.createMany({
      data: [
        { id: outletA, name: 'Outlet A', tenantId: tenantA },
        { id: outletB, name: 'Outlet B', tenantId: tenantB },
      ],
    });
    await prisma.product.createMany({
      data: [
        {
          id: productA,
          name: 'Product A',
          sku: 'IT-ORDER-A',
          price: 100,
          tenantId: tenantA,
        },
        {
          id: productB,
          name: 'Product B',
          sku: 'IT-ORDER-B',
          price: 200,
          tenantId: tenantB,
        },
      ],
    });
    await prisma.plan.create({
      data: {
        id: planId,
        type: PrismaPlanType.BUSINESS,
        name: 'Integration Business',
        priceCents: 49900,
      },
    });
  });

  afterEach(async () => {
    await prisma.outboxEvent.deleteMany({
      where: {
        type: {
          in: [
            'subscription.created',
            'subscription.activated',
            'invoice.created',
            'billing.payment.required',
            'invoice.paid',
            'invoice.failed',
          ],
        },
      },
    });
    await prisma.invoice.deleteMany({ where: { id: invoiceA } });
    await prisma.subscription.deleteMany({ where: { id: subscriptionA } });
    await prisma.payment.deleteMany({
      where: { orderId: { in: [orderA, orderB] } },
    });
    await prisma.salesOrderItem.deleteMany({
      where: { orderId: { in: [orderA, orderB] } },
    });
    await prisma.salesOrder.deleteMany({
      where: { id: { in: [orderA, orderB] } },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('creates orders with items, pricing, tenant scope, and outlet scope', async () => {
    const created = await orders.createOrder(
      tenantA,
      outletA,
      'IT-ORDER-A',
      300,
      [{ productId: productA, quantity: 3, price: 100, subtotal: 300 }],
    );

    expect(created.id).toBeDefined();
    await expect(
      prisma.salesOrder.findUnique({
        where: { id: created.id },
        include: { SalesOrderItem: true },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        tenantId: tenantA,
        outletId: outletA,
        totalAmount: 300,
        status: 'PENDING',
        SalesOrderItem: [
          expect.objectContaining({
            productId: productA,
            quantity: 3,
            subtotal: 300,
          }),
        ],
      }),
    );
    await expect(orders.findOne(created.id, tenantB)).resolves.toBeNull();
    await expect(
      orders.findOne(created.id, tenantA, outletB),
    ).resolves.toBeNull();
    await expect(
      orders.findOne(created.id, tenantA, outletA),
    ).resolves.not.toBeNull();
  });

  it('persists payment only for the tenant-owned order and isolates payment reads', async () => {
    await prisma.salesOrder.create({
      data: {
        id: orderA,
        orderNumber: 'IT-PAYMENT-A',
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

    await expect(
      payments.findOrderForPayment(orderA, tenantA),
    ).resolves.toEqual(
      expect.objectContaining({ id: orderA, tenantId: tenantA }),
    );
    await expect(
      payments.findOrderForPayment(orderA, tenantB),
    ).resolves.toBeNull();

    const payment = await payments.createPayment(orderA, tenantA, 100, 'CASH');
    await expect(
      prisma.payment.findUnique({ where: { id: payment.id } }),
    ).resolves.toEqual(
      expect.objectContaining({
        orderId: orderA,
        tenantId: tenantA,
        amount: 100,
        status: 'PAID',
      }),
    );
    await expect(payments.findOne(payment.id, tenantB)).resolves.toBeNull();
  });

  it('persists subscription events and prevents cross-tenant billing updates', async () => {
    await prisma.subscription.create({
      data: {
        id: subscriptionA,
        tenantId: tenantA,
        planId,
        status: 'ACTIVE',
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    const subscription = await subscriptions.findById(subscriptionA, tenantA);
    expect(subscription?.tenantId).toBe(tenantA);
    await expect(
      subscriptions.findById(subscriptionA, tenantB),
    ).resolves.toBeNull();

    await prisma.invoice.create({
      data: {
        id: invoiceA,
        tenantId: tenantA,
        subscriptionId: subscriptionA,
        invoiceNumber: 'IT-INVOICE-A',
        amountCents: 49900,
        status: 'PENDING',
      },
    });
    await expect(
      billing.updateInvoiceStatus(invoiceA, tenantB, 'PAID'),
    ).resolves.toBeNull();
    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceA } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PENDING' }));
    await billing.updateInvoiceStatus(invoiceA, tenantA, 'PAID');
    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceA } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PAID' }));
  });

  it('enforces product tenant/outlet reads and scoped updates in PostgreSQL', async () => {
    await expect(products.findOne(productA, tenantA)).resolves.toEqual(
      expect.objectContaining({
        id: productA,
        tenantId: tenantA,
        outletId: null,
      }),
    );
    await expect(products.findOne(productA, tenantB)).resolves.toBeNull();

    const updated = await products.updateProduct(productA, tenantA, {
      name: 'Product A Updated',
      price: Money.fromInteger(125),
    });
    expect(updated?.name).toBe('Product A Updated');
    expect(updated?.price.toNumber()).toBe(125);
    await expect(
      products.updateProduct(productA, tenantB, {
        name: 'Cross Tenant Update',
      }),
    ).resolves.toBeNull();
    await products.updateProduct(productA, tenantA, {
      name: 'Product A',
      price: Money.fromInteger(100),
    });
  });

  it('persists subscription lifecycle state and its domain events to outbox', async () => {
    const aggregate = SubscriptionAggregate.create(
      {
        id: subscriptionA,
        tenantId: tenantA,
        planId,
        status: SubscriptionStatus.ACTIVE,
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        endedAt: null,
        deletedAt: null,
      },
      {
        id: planId,
        type: DomainPlanType.BUSINESS,
        name: 'Integration Business',
        priceCents: 49900,
      },
    );
    await subscriptions.save(aggregate);

    await expect(
      prisma.subscription.findUnique({ where: { id: subscriptionA } }),
    ).resolves.toEqual(
      expect.objectContaining({ tenantId: tenantA, planId, status: 'ACTIVE' }),
    );
    await expect(
      prisma.outboxEvent.findMany({
        where: {
          type: { in: ['subscription.created', 'subscription.activated'] },
        },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'PENDING' })]),
    );
  });
});
