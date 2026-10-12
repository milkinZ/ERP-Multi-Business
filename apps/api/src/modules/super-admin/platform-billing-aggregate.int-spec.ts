import {
  PlanType,
  PrismaClient,
  SubscriptionStatus,
  XenditPaymentRequestAttemptState,
} from '@prisma/client';

import { requestContext } from '../../core/request-context/request-context';
import { BillingRepository } from '../billing/billing.repository';
import { BillingService } from '../billing/billing.service';
import { PlanRepository } from '../subscription/plans/plan.repository';
import { SubscriptionRepository } from '../subscription/domain/subscription.repository';
import { TenantContextService } from '../tenants/tenant-context.service';
import { OutboxPublisher } from '../../infrastructure/events/outbox.publisher';
import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { SuperAdminRepository } from './super-admin.repository';

const prisma = new PrismaClient();
const runId = `${process.pid}-${Date.now()}`;
const tenantIds = [
  `it-api001-tenant-a-${runId}`,
  `it-api001-tenant-b-${runId}`,
  `it-api001-tenant-c-${runId}`,
];
const invoiceIds = [
  `it-api001-pending-${runId}`,
  `it-api001-paid-${runId}`,
  `it-api001-failed-${runId}`,
  `it-api001-pending-usd-${runId}`,
  `it-api001-webhook-${runId}`,
];
const subscriptionIds = [
  `it-api001-sub-active-${runId}`,
  `it-api001-sub-past-due-${runId}`,
  `it-api001-sub-cancelled-${runId}`,
];
const paymentRequestIds = [
  `it-api001-attempt-pending-${runId}`,
  `it-api001-attempt-webhook-${runId}`,
];
const platformTenantId = `it-api001-platform-${runId}`;
const repository = new SuperAdminRepository(prisma as never);
const billingRepository = new BillingRepository(prisma as never);
const billing = new BillingService(
  billingRepository,
  new SubscriptionRepository(prisma as never),
  new PlanRepository(prisma as never),
  new TenantContextService(),
  new OutboxPublisher(prisma as never),
);
const createdPlanIds: string[] = [];
let plans: Array<{ id: string; type: PlanType; name: string }> = [];
let baselineAggregate: Awaited<
  ReturnType<typeof repository.getBillingAggregate>
>;

async function ensurePlan(type: PlanType) {
  const existing = await prisma.plan.findUnique({ where: { type } });
  if (existing) return existing;

  const id = `it-api001-plan-${type.toLowerCase()}-${runId}`;
  const plan = await prisma.plan.create({
    data: { id, type, name: id, priceCents: 1000 },
  });
  createdPlanIds.push(id);
  return plan;
}

async function cleanup() {
  await prisma.xenditWebhookReceipt.deleteMany({
    where: { paymentId: `it-api001-webhook-payment-${runId}` },
  });
  await prisma.outboxEvent.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  await prisma.subscription.deleteMany({
    where: { id: { in: subscriptionIds } },
  });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

async function createFixtures() {
  await prisma.tenant.createMany({
    data: tenantIds.map((id) => ({ id, name: id })),
  });

  const activePlan = plans[0];
  const growthPlan = plans[1];
  await prisma.subscription.createMany({
    data: [
      {
        id: subscriptionIds[0],
        tenantId: tenantIds[0],
        planId: activePlan.id,
        status: SubscriptionStatus.ACTIVE,
      },
      {
        id: subscriptionIds[1],
        tenantId: tenantIds[1],
        planId: growthPlan.id,
        status: SubscriptionStatus.PAST_DUE,
      },
      {
        id: subscriptionIds[2],
        tenantId: tenantIds[2],
        planId: activePlan.id,
        status: SubscriptionStatus.CANCELLED,
      },
    ],
  });

  await prisma.invoice.createMany({
    data: [
      {
        id: invoiceIds[0],
        tenantId: tenantIds[0],
        subscriptionId: subscriptionIds[0],
        invoiceNumber: `IT-API001-PENDING-${runId}`,
        amountCents: 1200,
        currency: 'IDR',
        status: 'PENDING',
        providerStatus: 'PENDING',
      },
      {
        id: invoiceIds[1],
        tenantId: tenantIds[0],
        subscriptionId: subscriptionIds[0],
        invoiceNumber: `IT-API001-PAID-${runId}`,
        amountCents: 3000,
        currency: 'IDR',
        status: 'PAID',
        paidAt: new Date(),
        providerStatus: 'SUCCEEDED',
      },
      {
        id: invoiceIds[2],
        tenantId: tenantIds[1],
        subscriptionId: subscriptionIds[2],
        invoiceNumber: `IT-API001-FAILED-${runId}`,
        amountCents: 800,
        currency: 'USD',
        status: 'FAILED',
        providerStatus: 'FAILED',
      },
      {
        id: invoiceIds[3],
        tenantId: tenantIds[1],
        subscriptionId: subscriptionIds[2],
        invoiceNumber: `IT-API001-PENDING-USD-${runId}`,
        amountCents: 500,
        currency: 'USD',
        status: 'PENDING',
      },
      {
        id: invoiceIds[4],
        tenantId: tenantIds[0],
        subscriptionId: subscriptionIds[0],
        invoiceNumber: `IT-API001-WEBHOOK-${runId}`,
        amountCents: 49900,
        currency: 'IDR',
        status: 'PENDING',
        providerReferenceId: `IT-API001-REF-${runId}`,
        providerPaymentRequestId: `IT-API001-REQUEST-${runId}`,
      },
    ],
  });

  await prisma.xenditPaymentRequestAttempt.createMany({
    data: [
      {
        id: paymentRequestIds[0],
        invoiceId: invoiceIds[0],
        tenantId: tenantIds[0],
        state: XenditPaymentRequestAttemptState.IN_PROGRESS,
      },
      {
        id: paymentRequestIds[1],
        invoiceId: invoiceIds[4],
        tenantId: tenantIds[0],
        state: XenditPaymentRequestAttemptState.COMPLETED,
        providerPaymentRequestId: `IT-API001-REQUEST-${runId}`,
      },
    ],
  });
}

const aggregate = () =>
  requestContext.run({ tenantId: platformTenantId }, () =>
    repository.getBillingAggregate(),
  );

const invoiceBucket = (
  result: Awaited<ReturnType<typeof aggregate>>,
  status: string,
  currency: string,
) =>
  result.invoices.byStatusAndCurrency.find(
    (group) => group.status === status && group.currency === currency,
  ) ?? { count: 0, amountCents: 0 };

describe('Platform billing aggregate PostgreSQL integration', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    plans = [
      await ensurePlan(PlanType.STARTER),
      await ensurePlan(PlanType.BUSINESS),
    ];
  });

  beforeEach(async () => {
    await cleanup();
    baselineAggregate = await aggregate();
    await createFixtures();
  });

  afterAll(async () => {
    await cleanup();
    if (createdPlanIds.length > 0) {
      await prisma.plan.deleteMany({ where: { id: { in: createdPlanIds } } });
    }
    await prisma.$disconnect();
  });

  it('returns a valid empty billing aggregate when no billing rows exist', async () => {
    await cleanup();
    const result = await aggregate();

    expect(result.subscriptions).toEqual({
      total: 0,
      byStatus: [],
      byPlan: [],
    });
    expect(result.invoices).toEqual({
      total: 0,
      byStatusAndCurrency: [],
      byProviderStatus: [],
    });
    expect(result.paymentRequests).toEqual({ total: 0, byState: [] });
  });

  it('aggregates all tenants by internal status, plan, currency, and persisted provider state without double counting', async () => {
    const before = baselineAggregate;
    const beforeWebhook = await aggregate();
    const webhookInput = {
      eventType: 'payment.capture',
      eventCreatedAt: '2026-09-30T12:00:00.000Z',
      providerUpdatedAt: '2026-09-30T12:00:01.000Z',
      paymentRequestId: `IT-API001-REQUEST-${runId}`,
      referenceId: `IT-API001-REF-${runId}`,
      paymentId: `it-api001-webhook-payment-${runId}`,
      amount: 49900,
      currency: 'IDR',
      status: 'SUCCEEDED',
    };
    const concurrentAggregate = aggregate();
    const webhookProcessing = requestContext.run(
      { tenantId: tenantIds[0] },
      () => billing.handleXenditWebhookEvent(webhookInput),
    );
    const [concurrentSnapshot, webhookResult] = await Promise.all([
      concurrentAggregate,
      webhookProcessing,
    ]);
    const pendingBeforeWebhook = invoiceBucket(beforeWebhook, 'PENDING', 'IDR');
    const paidBeforeWebhook = invoiceBucket(beforeWebhook, 'PAID', 'IDR');
    const pendingConcurrent = invoiceBucket(
      concurrentSnapshot,
      'PENDING',
      'IDR',
    );
    const paidConcurrent = invoiceBucket(concurrentSnapshot, 'PAID', 'IDR');
    const sawPreCommitSnapshot =
      pendingConcurrent.count === pendingBeforeWebhook.count &&
      pendingConcurrent.amountCents === pendingBeforeWebhook.amountCents &&
      paidConcurrent.count === paidBeforeWebhook.count &&
      paidConcurrent.amountCents === paidBeforeWebhook.amountCents;
    const sawPostCommitSnapshot =
      pendingConcurrent.count === pendingBeforeWebhook.count - 1 &&
      pendingConcurrent.amountCents ===
        pendingBeforeWebhook.amountCents - webhookInput.amount &&
      paidConcurrent.count === paidBeforeWebhook.count + 1 &&
      paidConcurrent.amountCents ===
        paidBeforeWebhook.amountCents + webhookInput.amount;
    expect(sawPreCommitSnapshot || sawPostCommitSnapshot).toBe(true);

    const duplicateResult = await requestContext.run(
      { tenantId: tenantIds[0] },
      () => billing.handleXenditWebhookEvent(webhookInput),
    );
    expect(webhookResult).toBe('PROCESSED');
    expect(duplicateResult).toBe('DUPLICATE');

    const result = await aggregate();
    expect(result.tenants.total - before.tenants.total).toBe(tenantIds.length);
    const activeTenantCount =
      result.tenants.byStatus.find((group) => group.status === 'ACTIVE')
        ?.count ?? 0;
    const previousActiveTenantCount =
      before.tenants.byStatus.find((group) => group.status === 'ACTIVE')
        ?.count ?? 0;
    expect(activeTenantCount - previousActiveTenantCount).toBe(
      tenantIds.length,
    );

    expect(result.subscriptions.total - before.subscriptions.total).toBe(3);
    const subscriptionStatusDeltas = new Map(
      result.subscriptions.byStatus.map((group) => [
        group.status,
        group.count -
          (before.subscriptions.byStatus.find(
            (previous) => previous.status === group.status,
          )?.count ?? 0),
      ]),
    );
    expect(subscriptionStatusDeltas.get('ACTIVE')).toBe(1);
    expect(subscriptionStatusDeltas.get('PAST_DUE')).toBe(1);
    expect(subscriptionStatusDeltas.get('CANCELLED')).toBe(1);
    const starterPlan = plans[0];
    const businessPlan = plans[1];
    const byPlanDelta = (planId: string) => {
      const count =
        result.subscriptions.byPlan.find((group) => group.planId === planId)
          ?.subscriptionCount ?? 0;
      const previous =
        before.subscriptions.byPlan.find((group) => group.planId === planId)
          ?.subscriptionCount ?? 0;
      return count - previous;
    };
    expect(byPlanDelta(starterPlan.id)).toBe(2);
    expect(byPlanDelta(businessPlan.id)).toBe(1);

    expect(result.invoices.total - before.invoices.total).toBe(5);
    const invoiceDeltas = new Map(
      result.invoices.byStatusAndCurrency.map((group) => {
        const key = `${group.status}:${group.currency}`;
        const previous = before.invoices.byStatusAndCurrency.find(
          (candidate) =>
            candidate.status === group.status &&
            candidate.currency === group.currency,
        );
        return [
          key,
          {
            count: group.count - (previous?.count ?? 0),
            amountCents: group.amountCents - (previous?.amountCents ?? 0),
          },
        ];
      }),
    );
    expect(invoiceDeltas.get('PENDING:IDR')).toEqual({
      count: 1,
      amountCents: 1200,
    });
    expect(invoiceDeltas.get('PAID:IDR')).toEqual({
      count: 2,
      amountCents: 52900,
    });
    expect(invoiceDeltas.get('FAILED:USD')).toEqual({
      count: 1,
      amountCents: 800,
    });
    expect(invoiceDeltas.get('PENDING:USD')).toEqual({
      count: 1,
      amountCents: 500,
    });

    expect(result.paymentRequests.total - before.paymentRequests.total).toBe(2);
    const inProgressCount =
      result.paymentRequests.byState.find(
        (group) => group.state === 'IN_PROGRESS',
      )?.count ?? 0;
    const previousInProgressCount =
      before.paymentRequests.byState.find(
        (group) => group.state === 'IN_PROGRESS',
      )?.count ?? 0;
    const completedCount =
      result.paymentRequests.byState.find(
        (group) => group.state === 'COMPLETED',
      )?.count ?? 0;
    const previousCompletedCount =
      before.paymentRequests.byState.find(
        (group) => group.state === 'COMPLETED',
      )?.count ?? 0;
    expect(inProgressCount - previousInProgressCount).toBe(1);
    expect(completedCount - previousCompletedCount).toBe(1);

    const providerStatusDeltas = new Map(
      result.invoices.byProviderStatus.map((group) => {
        const key = group.providerStatus ?? '<null>';
        const previous = before.invoices.byProviderStatus.find(
          (candidate) => candidate.providerStatus === group.providerStatus,
        );
        return [key, group.count - (previous?.count ?? 0)];
      }),
    );
    expect(providerStatusDeltas.get('PENDING')).toBe(1);
    expect(providerStatusDeltas.get('SUCCEEDED')).toBe(2);
    expect(providerStatusDeltas.get('FAILED')).toBe(1);
    expect(providerStatusDeltas.get('<null>')).toBe(1);

    const serializedAggregate = JSON.stringify(result);
    expect(serializedAggregate).not.toContain(`IT-API001-REQUEST-${runId}`);
    expect(serializedAggregate).not.toContain(
      `it-api001-webhook-payment-${runId}`,
    );
  });
});
