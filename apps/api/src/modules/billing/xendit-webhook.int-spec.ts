import { PrismaClient } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';
import { SubscriptionRepository } from '../subscription/domain/subscription.repository';
import { PlanRepository } from '../subscription/plans/plan.repository';
import { TenantContextService } from '../tenants/tenant-context.service';
import { OutboxPublisher } from '../../infrastructure/events/outbox.publisher';
import { requestContext } from '../../core/request-context/request-context';
import { WebhookController } from './webhook/webhook.controller';
import {
  XenditPaymentGateway,
  XenditPaymentRequestError,
} from './gateway/xendit-payment.gateway';

const prisma = new PrismaClient();
const billingRepository = new BillingRepository(prisma as never);
const chargeXenditRequest = jest.fn();
const billing = new BillingService(
  billingRepository,
  new SubscriptionRepository(prisma as never),
  new PlanRepository(prisma as never),
  new TenantContextService(),
  new OutboxPublisher(prisma as never),
  { charge: chargeXenditRequest } as never,
);
const webhookController = new WebhookController(
  billing,
  new XenditPaymentGateway({
    get: (key: string) =>
      key === 'XENDIT_WEBHOOK_TOKEN' ? 'integration-callback-token' : undefined,
  } as never),
);

const tenantA = 'it-xendit-webhook-tenant-a';
const tenantB = 'it-xendit-webhook-tenant-b';
const invoiceA = 'it-xendit-webhook-invoice-a';
const invoiceB = 'it-xendit-webhook-invoice-b';
const subscriptionId = 'it-xendit-webhook-subscription';
const testPlanId = 'it-xendit-webhook-plan';
let createdTestPlan = false;
const paymentIds = [
  'it-xendit-payment-duplicate',
  'it-xendit-payment-concurrent',
  'it-xendit-payment-rollback',
  'it-xendit-payment-failed-first',
  'it-xendit-payment-succeeded-first',
  'it-xendit-payment-cross-tenant',
  'it-xendit-payment-unknown',
  'it-xendit-payment-mismatch',
  'it-xendit-payment-created',
  'it-xendit-payment-created-wrong-id',
  'it-xendit-payment-created-duplicate',
  'it-xendit-payment-created-cross-tenant',
  'it-xendit-payment-created-race',
  'it-xendit-payment-created-persist-failure',
  'it-xendit-payment-created-timeout',
  'it-xendit-payment-unauthenticated',
];

type WebhookInput = Parameters<BillingService['handleXenditWebhookEvent']>[0];

function paymentWebhook(
  paymentId: string,
  overrides: Partial<WebhookInput> = {},
): WebhookInput {
  return {
    eventType: 'payment.capture',
    eventCreatedAt: '2026-09-28T12:00:00.000Z',
    providerUpdatedAt: '2026-09-28T12:00:01.000Z',
    paymentRequestId: `pr-${paymentId}`,
    referenceId: `INV-${paymentId}`,
    paymentId,
    amount: 49900,
    currency: 'IDR',
    status: 'SUCCEEDED',
    ...overrides,
  };
}

async function cleanup(includeTenants = false) {
  await prisma.xenditWebhookReceipt.deleteMany({
    where: { paymentId: { in: paymentIds } },
  });
  await prisma.outboxEvent.deleteMany({
    where: { tenantId: { in: [tenantA, tenantB] } },
  });
  await prisma.invoice.deleteMany({
    where: { id: { in: [invoiceA, invoiceB] } },
  });
  await prisma.subscription.deleteMany({ where: { id: subscriptionId } });
  if (createdTestPlan) {
    await prisma.plan.deleteMany({ where: { id: testPlanId } });
    createdTestPlan = false;
  }
  if (includeTenants) {
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA, tenantB] } },
    });
  }
}

async function createInvoice(
  id: string,
  tenantId = tenantA,
  fields: {
    invoiceNumber?: string;
    providerPaymentRequestId?: string;
    providerPaymentId?: string;
    providerReferenceId?: string;
    status?: string;
    subscriptionId?: string;
  } = {},
) {
  return prisma.invoice.create({
    data: {
      id,
      tenantId,
      subscriptionId: fields.subscriptionId,
      invoiceNumber: fields.invoiceNumber ?? `INV-${id}`,
      amountCents: 49900,
      currency: 'IDR',
      status: fields.status ?? 'PENDING',
      providerPaymentRequestId: fields.providerPaymentRequestId,
      providerPaymentId: fields.providerPaymentId,
      providerReferenceId: fields.providerReferenceId,
    },
  });
}

async function createTestSubscription(status: 'ACTIVE' | 'PAST_DUE') {
  let plan = await prisma.plan.findFirst();
  if (!plan) {
    plan = await prisma.plan.create({
      data: {
        id: testPlanId,
        type: 'FREE',
        name: 'Xendit callback integration plan',
        priceCents: 0,
      },
    });
    createdTestPlan = true;
  }
  return prisma.subscription.create({
    data: {
      id: subscriptionId,
      tenantId: tenantA,
      planId: plan.id,
      status,
      startedAt: new Date(),
    },
  });
}

describe('Xendit webhook idempotency PostgreSQL integration', () => {
  const inTenant = <T>(tenantId: string, fn: () => Promise<T>) =>
    requestContext.run({ tenantId }, fn);

  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await cleanup(true);
    await prisma.tenant.createMany({
      data: [
        {
          id: tenantA,
          name: 'Xendit Webhook Tenant A',
          businessType: 'RETAIL',
        },
        {
          id: tenantB,
          name: 'Xendit Webhook Tenant B',
          businessType: 'RETAIL',
        },
      ],
    });
  });

  beforeEach(async () => {
    chargeXenditRequest.mockReset();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup(true);
    await prisma.$disconnect();
  });

  it('processes a provider callback once and returns duplicate for redelivery', async () => {
    await createInvoice(invoiceA, tenantA, {
      invoiceNumber: 'IT-XENDIT-DUPLICATE',
      providerReferenceId: `INV-${paymentIds[0]}`,
      providerPaymentRequestId: `pr-${paymentIds[0]}`,
    });
    const callback = paymentWebhook(paymentIds[0]);

    await expect(billing.handleXenditWebhookEvent(callback)).resolves.toBe(
      'PROCESSED',
    );
    await expect(billing.handleXenditWebhookEvent(callback)).resolves.toBe(
      'DUPLICATE',
    );

    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceA } }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'PAID',
        providerPaymentId: paymentIds[0],
        providerPaymentRequestId: `pr-${paymentIds[0]}`,
      }),
    );
    await expect(
      prisma.xenditWebhookReceipt.count({
        where: { paymentId: paymentIds[0] },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.outboxEvent.count({
        where: { tenantId: tenantA, type: 'invoice.paid' },
      }),
    ).resolves.toBe(1);
  });

  it('deduplicates concurrent semantic retries with different timestamps and capture ordering', async () => {
    await createInvoice(invoiceA, tenantA, {
      invoiceNumber: 'IT-XENDIT-CONCURRENT',
      providerReferenceId: `INV-${paymentIds[1]}`,
      providerPaymentRequestId: `pr-${paymentIds[1]}`,
    });
    const firstDelivery = {
      event: 'payment.capture',
      created: '2026-09-28T12:00:00.000Z',
      data: {
        payment_id: paymentIds[1],
        payment_request_id: `pr-${paymentIds[1]}`,
        reference_id: `INV-${paymentIds[1]}`,
        request_amount: 49900,
        currency: 'IDR',
        status: 'SUCCEEDED',
        updated: '2026-09-28T12:00:01.000Z',
        captures: [{ capture_id: 'capture-a' }, { capture_id: 'capture-b' }],
        metadata: { invoiceId: 'attacker-value-a' },
      },
    };
    const retryDelivery = {
      ...firstDelivery,
      created: '2026-09-28T12:05:00.000Z',
      data: {
        ...firstDelivery.data,
        updated: '2026-09-28T12:05:01.000Z',
        captures: [{ capture_id: 'capture-b' }, { capture_id: 'capture-a' }],
        metadata: { invoiceId: 'attacker-value-b' },
      },
    };

    const results = await Promise.all([
      webhookController.handlePaymentWebhook(
        firstDelivery,
        'integration-callback-token',
      ),
      webhookController.handlePaymentWebhook(
        retryDelivery,
        'integration-callback-token',
      ),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      'DUPLICATE',
      'PROCESSED',
    ]);
    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceA } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PAID' }));
    await expect(
      prisma.xenditWebhookReceipt.count({
        where: { paymentId: paymentIds[1] },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.outboxEvent.count({
        where: { tenantId: tenantA, type: 'invoice.paid' },
      }),
    ).resolves.toBe(1);
  });

  it('rolls back receipt and financial state on failure, then safely retries', async () => {
    await createInvoice(invoiceA, tenantA, {
      invoiceNumber: 'IT-XENDIT-ROLLBACK',
      providerReferenceId: `INV-${paymentIds[2]}`,
      providerPaymentRequestId: `pr-${paymentIds[2]}`,
    });
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION it_xendit_force_paid_outbox_failure()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."type" = 'invoice.paid' THEN
          RAISE EXCEPTION 'forced paid outbox failure';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER it_xendit_force_paid_outbox_failure_trigger
      BEFORE INSERT ON "OutboxEvent" FOR EACH ROW
      EXECUTE FUNCTION it_xendit_force_paid_outbox_failure();
    `);

    const callback = paymentWebhook(paymentIds[2]);
    try {
      await expect(billing.handleXenditWebhookEvent(callback)).rejects.toThrow(
        'forced paid outbox failure',
      );
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS it_xendit_force_paid_outbox_failure_trigger ON "OutboxEvent"',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS it_xendit_force_paid_outbox_failure()',
      );
    }

    await expect(
      prisma.xenditWebhookReceipt.count({
        where: { paymentId: paymentIds[2] },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceA } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PENDING' }));
    await expect(
      prisma.outboxEvent.count({
        where: { tenantId: tenantA, type: 'invoice.paid' },
      }),
    ).resolves.toBe(0);

    await expect(billing.handleXenditWebhookEvent(callback)).resolves.toBe(
      'PROCESSED',
    );
    await expect(
      prisma.outboxEvent.count({
        where: { tenantId: tenantA, type: 'invoice.paid' },
      }),
    ).resolves.toBe(1);
  });

  it('rejects unknown provider payment identifiers without retaining a receipt', async () => {
    await createInvoice(invoiceA, tenantA, {
      invoiceNumber: `INV-${paymentIds[6]}`,
    });
    await expect(
      billing.handleXenditWebhookEvent(paymentWebhook(paymentIds[6])),
    ).rejects.toThrow('not pre-correlated');
    await expect(
      prisma.xenditWebhookReceipt.count({
        where: { paymentId: paymentIds[6] },
      }),
    ).resolves.toBe(0);
  });

  it('rejects amount and currency mismatches without retaining a receipt', async () => {
    await createInvoice(invoiceA, tenantA, {
      invoiceNumber: 'IT-XENDIT-MISMATCH',
      providerReferenceId: `INV-${paymentIds[7]}`,
      providerPaymentRequestId: `pr-${paymentIds[7]}`,
    });
    const callback = paymentWebhook(paymentIds[7]);

    await expect(
      billing.handleXenditWebhookEvent({ ...callback, amount: 1 }),
    ).rejects.toThrow('Provider amount does not match');
    await expect(
      billing.handleXenditWebhookEvent({ ...callback, currency: 'USD' }),
    ).rejects.toThrow('Provider currency does not match');

    await expect(
      prisma.xenditWebhookReceipt.count({
        where: { paymentId: paymentIds[7] },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceA } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PENDING' }));
  });

  it('does not allow identifiers from different tenants to resolve to different invoices', async () => {
    await createInvoice(invoiceA, tenantA, {
      invoiceNumber: 'IT-XENDIT-CROSS-A',
    });
    await createInvoice(invoiceB, tenantB, {
      invoiceNumber: 'IT-XENDIT-CROSS-B',
      providerPaymentId: paymentIds[5],
      providerPaymentRequestId: `pr-${paymentIds[5]}`,
    });

    await expect(
      billing.handleXenditWebhookEvent(
        paymentWebhook(paymentIds[5], {
          referenceId: 'IT-XENDIT-CROSS-A',
        }),
      ),
    ).rejects.toThrow('different ERP invoices');

    await expect(
      prisma.invoice.findMany({ where: { id: { in: [invoiceA, invoiceB] } } }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: invoiceA, status: 'PENDING' }),
        expect.objectContaining({ id: invoiceB, status: 'PENDING' }),
      ]),
    );
  });

  it('ignores out-of-order terminal callbacks and never reverses a terminal state', async () => {
    await createInvoice(invoiceA, tenantA, {
      invoiceNumber: 'IT-XENDIT-FAILED-FIRST',
      providerReferenceId: `INV-${paymentIds[3]}`,
      providerPaymentRequestId: `pr-${paymentIds[3]}`,
    });
    await billing.handleXenditWebhookEvent(
      paymentWebhook(paymentIds[3], {
        eventType: 'payment.failure',
        status: 'FAILED',
        eventCreatedAt: '2026-09-28T12:00:00.000Z',
      }),
    );
    await expect(
      billing.handleXenditWebhookEvent(
        paymentWebhook(paymentIds[3], {
          eventType: 'payment.capture',
          status: 'SUCCEEDED',
          eventCreatedAt: '2026-09-28T12:01:00.000Z',
          providerUpdatedAt: '2026-09-28T12:01:01.000Z',
        }),
      ),
    ).resolves.toBe('IGNORED');
    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceA } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'FAILED' }));

    await createInvoice(invoiceB, tenantA, {
      invoiceNumber: 'IT-XENDIT-SUCCEEDED-FIRST',
      providerReferenceId: 'IT-XENDIT-SUCCEEDED-FIRST',
      providerPaymentRequestId: `pr-${paymentIds[4]}`,
    });
    await billing.handleXenditWebhookEvent(
      paymentWebhook(paymentIds[4], {
        referenceId: 'IT-XENDIT-SUCCEEDED-FIRST',
      }),
    );
    await expect(
      billing.handleXenditWebhookEvent(
        paymentWebhook(paymentIds[4], {
          eventType: 'payment.failure',
          status: 'FAILED',
          referenceId: 'IT-XENDIT-SUCCEEDED-FIRST',
          eventCreatedAt: '2026-09-28T12:02:00.000Z',
          providerUpdatedAt: '2026-09-28T12:02:01.000Z',
        }),
      ),
    ).resolves.toBe('IGNORED');
    await expect(
      billing.handleXenditWebhookEvent(
        paymentWebhook(paymentIds[4], {
          eventType: 'payment.failure',
          status: 'EXPIRED',
          referenceId: 'IT-XENDIT-SUCCEEDED-FIRST',
          eventCreatedAt: '2026-09-28T12:03:00.000Z',
          providerUpdatedAt: '2026-09-28T12:03:01.000Z',
        }),
      ),
    ).resolves.toBe('IGNORED');
    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceB } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PAID' }));
  });

  it('persists the created Payment Request ID before callback settlement', async () => {
    const invoiceNumber = 'IT-XENDIT-CREATE-CORRELATION';
    const paymentRequestId = 'pr-xendit-created-correlation';
    const paymentId = paymentIds[8];
    let plan = await prisma.plan.findFirst();
    if (!plan) {
      plan = await prisma.plan.create({
        data: {
          id: testPlanId,
          type: 'FREE',
          name: 'Xendit callback integration plan',
          priceCents: 0,
        },
      });
      createdTestPlan = true;
    }
    await createTestSubscription('PAST_DUE');
    await createInvoice(invoiceA, tenantA, {
      invoiceNumber,
      subscriptionId,
    });
    chargeXenditRequest.mockResolvedValue({
      success: true,
      transactionId: '',
      gatewayReference: paymentRequestId,
      paymentRequestId,
      status: 'PENDING',
    });
    const callback = {
      event: 'payment.capture',
      created: '2026-09-28T12:00:00.000Z',
      data: {
        payment_id: paymentId,
        payment_request_id: paymentRequestId,
        reference_id: invoiceNumber,
        request_amount: 49900,
        currency: 'IDR',
        status: 'SUCCEEDED',
        updated: '2026-09-28T12:00:01.000Z',
        captures: [{ capture_id: 'capture-it-123', capture_amount: 49900 }],
        metadata: { invoiceId: invoiceB },
      },
    };

    await expect(
      webhookController.handlePaymentWebhook(callback, 'wrong-token'),
    ).rejects.toThrow('Invalid Xendit callback token');
    await expect(
      prisma.xenditWebhookReceipt.count({ where: { paymentId } }),
    ).resolves.toBe(0);
    await expect(
      webhookController.handlePaymentWebhook(callback, undefined),
    ).rejects.toThrow('Invalid Xendit callback token');
    await expect(
      prisma.xenditWebhookReceipt.count({ where: { paymentId } }),
    ).resolves.toBe(0);
    await expect(
      webhookController.handlePaymentWebhook(
        callback,
        'integration-callback-token',
      ),
    ).rejects.toThrow('not pre-correlated');
    await expect(
      prisma.xenditWebhookReceipt.count({ where: { paymentId } }),
    ).resolves.toBe(0);

    await expect(
      inTenant(tenantA, () =>
        billing.createXenditPaymentRequest(invoiceA, 'QRIS'),
      ),
    ).resolves.toEqual({ paymentRequestId, status: 'PENDING' });

    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceA } }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'PENDING',
        providerReferenceId: invoiceNumber,
        providerPaymentRequestId: paymentRequestId,
      }),
    );
    await expect(
      webhookController.handlePaymentWebhook(
        callback,
        'integration-callback-token',
      ),
    ).resolves.toEqual({ received: true, status: 'PROCESSED' });
    await expect(
      webhookController.handlePaymentWebhook(
        callback,
        'integration-callback-token',
      ),
    ).resolves.toEqual({ received: true, status: 'DUPLICATE' });
    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceA } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PAID' }));
    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceB } }),
    ).resolves.toBeNull();
    await expect(
      prisma.outboxEvent.count({
        where: { tenantId: tenantA, type: 'invoice.paid' },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.subscription.findUnique({ where: { id: subscriptionId } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'ACTIVE' }));
  });

  it('rejects missing and invalid callback tokens without financial mutations', async () => {
    const paymentId = paymentIds[15];
    const paymentRequestId = `pr-${paymentId}`;
    const invoiceNumber = `INV-${paymentId}`;
    await createTestSubscription('PAST_DUE');
    await createInvoice(invoiceA, tenantA, {
      invoiceNumber,
      providerPaymentRequestId: paymentRequestId,
      providerReferenceId: invoiceNumber,
      subscriptionId,
    });
    const callback = {
      event: 'payment.capture',
      created: '2026-09-28T12:00:00.000Z',
      data: {
        payment_id: paymentId,
        payment_request_id: paymentRequestId,
        reference_id: invoiceNumber,
        request_amount: 49900,
        currency: 'IDR',
        status: 'SUCCEEDED',
        updated: '2026-09-28T12:00:01.000Z',
        captures: [{ capture_id: `capture-${paymentId}` }],
      },
    };

    await expect(
      webhookController.handlePaymentWebhook(callback, undefined),
    ).rejects.toThrow('Invalid Xendit callback token');
    await expect(
      webhookController.handlePaymentWebhook(callback, 'incorrect-token'),
    ).rejects.toThrow('Invalid Xendit callback token');

    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceA } }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'PENDING',
        providerPaymentRequestId: paymentRequestId,
        providerReferenceId: invoiceNumber,
      }),
    );
    await expect(
      prisma.subscription.findUnique({ where: { id: subscriptionId } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PAST_DUE' }));
    await expect(
      prisma.xenditWebhookReceipt.count({ where: { paymentId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.outboxEvent.count({
        where: {
          tenantId: tenantA,
          type: {
            in: ['invoice.paid', 'invoice.failed', 'subscription.past-due'],
          },
        },
      }),
    ).resolves.toBe(0);
  });

  it('reuses a correlated request and rejects invalid or cross-tenant invoices', async () => {
    await createInvoice(invoiceA, tenantA, {
      invoiceNumber: 'IT-XENDIT-ALREADY-CORRELATED',
      providerPaymentRequestId: 'pr-xendit-already-correlated',
    });
    await expect(
      inTenant(tenantA, () =>
        billing.createXenditPaymentRequest(invoiceA, 'QRIS'),
      ),
    ).resolves.toEqual({
      paymentRequestId: 'pr-xendit-already-correlated',
      status: 'PENDING',
    });
    expect(chargeXenditRequest).not.toHaveBeenCalled();

    await createInvoice(invoiceB, tenantA, {
      invoiceNumber: 'IT-XENDIT-PAID-CANNOT-CREATE',
      status: 'PAID',
    });
    await expect(
      inTenant(tenantA, () =>
        billing.createXenditPaymentRequest(invoiceB, 'QRIS'),
      ),
    ).rejects.toThrow('Only pending invoices can be paid');

    await expect(
      inTenant(tenantB, () =>
        billing.createXenditPaymentRequest(invoiceA, 'QRIS'),
      ),
    ).rejects.toThrow('Invoice not found');
    expect(chargeXenditRequest).not.toHaveBeenCalled();
  });

  it('allows only one Xendit POST for concurrent requests on the same invoice', async () => {
    await createInvoice(invoiceA, tenantA, {
      invoiceNumber: 'IT-XENDIT-CREATE-RACE',
    });

    let finishProviderCall!: (value: {
      success: true;
      transactionId: string;
      gatewayReference: string;
      paymentRequestId: string;
      status: 'PENDING';
    }) => void;
    let providerCallStarted!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      providerCallStarted = resolve;
    });
    chargeXenditRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishProviderCall = resolve;
          providerCallStarted();
        }),
    );

    const requestA = inTenant(tenantA, () =>
      billing.createXenditPaymentRequest(invoiceA, 'QRIS'),
    );
    await providerStarted;

    await expect(
      inTenant(tenantA, () =>
        billing.createXenditPaymentRequest(invoiceA, 'QRIS'),
      ),
    ).rejects.toThrow('already in progress');
    expect(chargeXenditRequest).toHaveBeenCalledTimes(1);

    finishProviderCall({
      success: true,
      transactionId: '',
      gatewayReference: 'pr-xendit-race',
      paymentRequestId: 'pr-xendit-race',
      status: 'PENDING',
    });
    await expect(requestA).resolves.toEqual({
      paymentRequestId: 'pr-xendit-race',
      status: 'PENDING',
    });
    expect(chargeXenditRequest).toHaveBeenCalledTimes(1);
  });

  it('persists UNKNOWN on provider timeout and blocks a blind retry', async () => {
    await createInvoice(invoiceA, tenantA, {
      invoiceNumber: 'IT-XENDIT-CREATE-TIMEOUT',
    });
    chargeXenditRequest.mockRejectedValue(
      new XenditPaymentRequestError('request timed out', 'UNKNOWN'),
    );

    await expect(
      inTenant(tenantA, () =>
        billing.createXenditPaymentRequest(invoiceA, 'QRIS'),
      ),
    ).rejects.toThrow('outcome is unknown');
    await expect(
      prisma.xenditPaymentRequestAttempt.findFirst({
        where: { invoiceId: invoiceA, tenantId: tenantA },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        state: 'UNKNOWN',
        providerPaymentRequestId: null,
      }),
    );

    await expect(
      inTenant(tenantA, () =>
        billing.createXenditPaymentRequest(invoiceA, 'QRIS'),
      ),
    ).rejects.toThrow('manual resolution');
    expect(chargeXenditRequest).toHaveBeenCalledTimes(1);
  });

  it('recovers the known provider ID after invoice persistence failed without another POST', async () => {
    const invoiceNumber = 'IT-XENDIT-CREATE-PERSIST-FAILURE';
    const paymentRequestId = 'pr-xendit-persist-failure';
    await createInvoice(invoiceA, tenantA, { invoiceNumber });
    chargeXenditRequest.mockResolvedValue({
      success: true,
      transactionId: '',
      gatewayReference: paymentRequestId,
      paymentRequestId,
      status: 'PENDING',
    });
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION it_xendit_block_correlation()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."providerPaymentRequestId" IS NOT NULL THEN
          RAISE EXCEPTION 'forced correlation persistence failure';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER it_xendit_block_correlation_trigger
      BEFORE UPDATE ON "Invoice" FOR EACH ROW
      EXECUTE FUNCTION it_xendit_block_correlation();
    `);

    try {
      await expect(
        inTenant(tenantA, () =>
          billing.createXenditPaymentRequest(invoiceA, 'QRIS'),
        ),
      ).rejects.toThrow('ERP correlation failed');
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS it_xendit_block_correlation_trigger ON "Invoice"',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS it_xendit_block_correlation()',
      );
    }

    await expect(
      prisma.xenditPaymentRequestAttempt.findFirst({
        where: { invoiceId: invoiceA },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        state: 'UNKNOWN',
        providerPaymentRequestId: paymentRequestId,
      }),
    );
    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceA } }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'PENDING',
        providerPaymentRequestId: null,
      }),
    );

    await expect(
      inTenant(tenantA, () =>
        billing.createXenditPaymentRequest(invoiceA, 'QRIS'),
      ),
    ).resolves.toEqual({ paymentRequestId, status: 'PENDING' });
    expect(chargeXenditRequest).toHaveBeenCalledTimes(1);
    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceA } }),
    ).resolves.toEqual(
      expect.objectContaining({
        providerPaymentRequestId: paymentRequestId,
        providerReferenceId: invoiceNumber,
      }),
    );
  });

  it('rejects an unrelated provider request ID even when the invoice reference matches', async () => {
    const invoiceNumber = 'IT-XENDIT-CREATE-WRONG-ID';
    await createInvoice(invoiceA, tenantA, {
      invoiceNumber,
      providerReferenceId: invoiceNumber,
      providerPaymentRequestId: 'pr-xendit-expected',
    });

    await expect(
      billing.handleXenditWebhookEvent(
        paymentWebhook(paymentIds[9], {
          paymentRequestId: 'pr-xendit-unrelated',
          referenceId: invoiceNumber,
        }),
      ),
    ).rejects.toThrow('not pre-correlated');
    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceA } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PENDING' }));
  });

  it('blocks duplicate provider request IDs on persistence', async () => {
    const paymentRequestId = 'pr-xendit-duplicate-id';
    await createInvoice(invoiceA, tenantA, {
      invoiceNumber: 'IT-XENDIT-CREATE-DUPLICATE-A',
    });
    await createInvoice(invoiceB, tenantA, {
      invoiceNumber: 'IT-XENDIT-CREATE-DUPLICATE-B',
    });
    await billingRepository.claimXenditPaymentRequest(invoiceA, tenantA);
    await billingRepository.completeXenditPaymentRequest(
      invoiceA,
      tenantA,
      'IT-XENDIT-CREATE-DUPLICATE-A',
      paymentRequestId,
    );
    chargeXenditRequest.mockResolvedValue({
      success: true,
      transactionId: '',
      gatewayReference: paymentRequestId,
      paymentRequestId,
      status: 'PENDING',
    });

    await expect(
      inTenant(tenantA, () =>
        billing.createXenditPaymentRequest(invoiceB, 'QRIS'),
      ),
    ).rejects.toThrow('ERP correlation failed');
    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceB } }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'PENDING',
        providerPaymentRequestId: null,
      }),
    );
  });

  it('does not let another tenant invoice reference redirect a correlated provider ID', async () => {
    const invoiceNumberA = 'IT-XENDIT-CREATE-TENANT-A';
    const invoiceNumberB = 'IT-XENDIT-CREATE-TENANT-B';
    const paymentRequestId = 'pr-xendit-tenant-b';
    await createInvoice(invoiceA, tenantA, { invoiceNumber: invoiceNumberA });
    await createInvoice(invoiceB, tenantB, {
      invoiceNumber: invoiceNumberB,
      providerReferenceId: invoiceNumberB,
      providerPaymentRequestId: paymentRequestId,
    });

    await expect(
      billing.handleXenditWebhookEvent(
        paymentWebhook(paymentIds[11], {
          paymentRequestId,
          referenceId: invoiceNumberA,
        }),
      ),
    ).rejects.toThrow('different ERP invoices');
    await expect(
      prisma.invoice.findMany({ where: { id: { in: [invoiceA, invoiceB] } } }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: invoiceA, status: 'PENDING' }),
        expect.objectContaining({ id: invoiceB, status: 'PENDING' }),
      ]),
    );
  });
});
