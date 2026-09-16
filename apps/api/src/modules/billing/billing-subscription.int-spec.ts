import { PrismaClient } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { requestContext } from '../../core/request-context/request-context';
import { OutboxPublisher } from '../../infrastructure/events/outbox.publisher';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';
import { SubscriptionRepository } from '../subscription/domain/subscription.repository';
import { SubscriptionService } from '../subscription/subscription.service';
import { PlanRepository } from '../subscription/plans/plan.repository';
import { TenantContextService } from '../tenants/tenant-context.service';

const prisma = new PrismaClient();
const billingRepository = new BillingRepository(prisma as never);
const subscriptionRepository = new SubscriptionRepository(prisma as never);
const planRepository = new PlanRepository(prisma as never);
const outbox = new OutboxPublisher(prisma as never);
const tenantContext = new TenantContextService();
const billing = new BillingService(
  billingRepository,
  subscriptionRepository,
  planRepository,
  tenantContext,
  outbox,
);
const subscriptions = new SubscriptionService(
  subscriptionRepository,
  planRepository,
  tenantContext,
  outbox,
);

const tenantA = 'it-billing-tenant-a';
const tenantB = 'it-billing-tenant-b';
const planA = 'it-billing-plan-a';
const planB = 'it-billing-plan-b';
const subscriptionA = 'it-billing-subscription-a';
const invoiceA = 'it-billing-invoice-a';

async function cleanup() {
  await prisma.outboxEvent.deleteMany({
    where: {
      type: {
        in: [
          'invoice.created',
          'billing.payment.required',
          'invoice.paid',
          'invoice.failed',
          'subscription.created',
          'subscription.activated',
          'subscription.plan.changed',
          'subscription.past_due',
        ],
      },
    },
  });
  await prisma.invoice.deleteMany({ where: { id: invoiceA } });
  await prisma.subscription.deleteMany({ where: { id: subscriptionA } });
  await prisma.plan.deleteMany({ where: { id: { in: [planA, planB] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
}

describe('Billing and subscription PostgreSQL integration', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await cleanup();
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: 'Billing Tenant A', businessType: 'RETAIL' },
        { id: tenantB, name: 'Billing Tenant B', businessType: 'RETAIL' },
      ],
    });
    await prisma.plan.createMany({
      data: [
        { id: planA, type: 'BUSINESS', name: 'Business A', priceCents: 49900 },
        {
          id: planB,
          type: 'ENTERPRISE',
          name: 'Enterprise B',
          priceCents: 99900,
        },
      ],
    });
  });

  beforeEach(async () => {
    await prisma.outboxEvent.deleteMany({
      where: {
        type: {
          in: [
            'invoice.created',
            'billing.payment.required',
            'invoice.paid',
            'invoice.failed',
            'subscription.created',
            'subscription.activated',
            'subscription.plan.changed',
            'subscription.past_due',
          ],
        },
      },
    });
    await prisma.invoice.deleteMany({ where: { id: invoiceA } });
    await prisma.subscription.deleteMany({ where: { id: subscriptionA } });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const inTenant = <T>(tenantId: string, fn: () => Promise<T>) =>
    requestContext.run({ tenantId }, fn);

  it('creates and upgrades a tenant subscription with persisted lifecycle events', async () => {
    await inTenant(tenantA, async () => {
      await subscriptions.createSubscription(planA);
      await prisma.subscription.update({
        where: { tenantId: tenantA },
        data: { id: subscriptionA },
      });
      await subscriptions.changePlan(planB);
    });

    await expect(
      prisma.subscription.findUnique({ where: { id: subscriptionA } }),
    ).resolves.toEqual(
      expect.objectContaining({
        tenantId: tenantA,
        planId: planB,
        status: 'ACTIVE',
      }),
    );
    await expect(
      prisma.outboxEvent.findMany({
        where: { type: 'subscription.plan.changed' },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'PENDING' })]),
    );
    await expect(
      inTenant(tenantB, () => subscriptions.getSubscriptionById(subscriptionA)),
    ).rejects.toThrow('Subscription not found');
  });

  it('creates billing records and makes duplicate success callbacks idempotent', async () => {
    await prisma.subscription.create({
      data: {
        id: subscriptionA,
        tenantId: tenantA,
        planId: planA,
        status: 'ACTIVE',
        startedAt: new Date(),
      },
    });
    await inTenant(tenantA, () => billing.executeBilling(subscriptionA));
    const invoice = await prisma.invoice.findFirst({
      where: { tenantId: tenantA },
    });
    expect(invoice).not.toBeNull();
    if (!invoice) throw new Error('Expected invoice');
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { id: invoiceA },
    });

    await inTenant(tenantA, () => billing.handlePaymentSuccess(invoiceA));
    await inTenant(tenantA, () => billing.handlePaymentSuccess(invoiceA));

    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceA } }),
    ).resolves.toEqual(
      expect.objectContaining({ status: 'PAID', tenantId: tenantA }),
    );
    await expect(
      prisma.outboxEvent.count({ where: { type: 'invoice.paid' } }),
    ).resolves.toBe(1);
  });

  it('persists payment failure as PAST_DUE and blocks cross-tenant invoice access', async () => {
    await prisma.subscription.create({
      data: {
        id: subscriptionA,
        tenantId: tenantA,
        planId: planA,
        status: 'ACTIVE',
        startedAt: new Date(),
      },
    });
    await prisma.invoice.create({
      data: {
        id: invoiceA,
        invoiceNumber: 'IT-BILLING-INVOICE',
        tenantId: tenantA,
        subscriptionId: subscriptionA,
        amountCents: 49900,
        status: 'PENDING',
      },
    });

    await expect(
      inTenant(tenantB, () => billing.getInvoiceById(invoiceA)),
    ).rejects.toThrow('Invoice not found');
    await inTenant(tenantA, () =>
      billing.handlePaymentFailure(invoiceA, 'declined'),
    );

    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceA } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'FAILED' }));
    await expect(
      prisma.subscription.findUnique({ where: { id: subscriptionA } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PAST_DUE' }));
  });

  it('publishes only one paid event for concurrent identical callbacks', async () => {
    await prisma.invoice.create({
      data: {
        id: invoiceA,
        invoiceNumber: 'IT-BILLING-CONCURRENT',
        tenantId: tenantA,
        amountCents: 49900,
        status: 'PENDING',
      },
    });

    await Promise.all([
      inTenant(tenantA, () => billing.handlePaymentSuccess(invoiceA)),
      inTenant(tenantA, () => billing.handlePaymentSuccess(invoiceA)),
    ]);

    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceA } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PAID' }));
    await expect(
      prisma.outboxEvent.count({ where: { type: 'invoice.paid' } }),
    ).resolves.toBe(1);
  });

  it('rolls back invoice payment when subscription persistence fails later in the transaction', async () => {
    await prisma.subscription.create({
      data: {
        id: subscriptionA,
        tenantId: tenantA,
        planId: planA,
        status: 'PAST_DUE',
        startedAt: new Date(),
      },
    });
    await prisma.invoice.create({
      data: {
        id: invoiceA,
        invoiceNumber: 'IT-BILLING-ROLLBACK',
        tenantId: tenantA,
        subscriptionId: subscriptionA,
        amountCents: 49900,
        status: 'PENDING',
      },
    });
    await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION it_billing_force_failure()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.id = '${subscriptionA}' THEN RAISE EXCEPTION 'forced subscription failure'; END IF;
          RETURN NEW;
        END;
        $$;
      `);
    await prisma.$executeRawUnsafe(`
        CREATE TRIGGER it_billing_force_failure_trigger
        BEFORE UPDATE ON "Subscription"
        FOR EACH ROW EXECUTE FUNCTION it_billing_force_failure();
      `);

    try {
      await expect(
        inTenant(tenantA, () => billing.handlePaymentSuccess(invoiceA)),
      ).rejects.toThrow('forced subscription failure');
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS it_billing_force_failure_trigger ON "Subscription"',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS it_billing_force_failure()',
      );
    }

    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceA } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PENDING' }));
    await expect(
      prisma.subscription.findUnique({ where: { id: subscriptionA } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PAST_DUE' }));
    await expect(
      prisma.outboxEvent.count({ where: { type: 'invoice.paid' } }),
    ).resolves.toBe(0);
  });
});
