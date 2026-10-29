import { PrismaClient, XenditPaymentRequestAttemptState } from '@prisma/client';

import { BillingRepository } from './billing.repository';
import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { DOMAIN_EVENTS } from '../../core/events/domain-events';

const prisma = new PrismaClient();
const runId = `${process.pid}-${Date.now()}`;
const tenantId = `it-invoice-cancel-tenant-${runId}`;
const userId = `it-invoice-cancel-user-${runId}`;
const invoiceIds = [
  `it-invoice-cancel-pending-${runId}`,
  `it-invoice-cancel-active-${runId}`,
  `it-invoice-cancel-paid-${runId}`,
];
const repository = new BillingRepository(prisma as never);

async function cleanup() {
  await prisma.xenditPaymentRequestAttempt.deleteMany({
    where: { invoiceId: { in: invoiceIds } },
  });
  await prisma.outboxEvent.deleteMany({
    where: { tenantId, type: DOMAIN_EVENTS.INVOICE_CANCELLED },
  });
  await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

async function createInvoice(id: string, status = 'PENDING') {
  return prisma.invoice.create({
    data: {
      id,
      tenantId,
      invoiceNumber: id,
      amountCents: 1000,
      currency: 'IDR',
      status,
    },
  });
}

describe('Pending invoice cancellation PostgreSQL integration', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await cleanup();
    await prisma.tenant.create({ data: { id: tenantId, name: tenantId } });
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        password: 'integration-test-only',
        tenantId,
      },
    });
    await createInvoice(invoiceIds[0]);
    await createInvoice(invoiceIds[1]);
    await createInvoice(invoiceIds[2], 'PAID');
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('atomically cancels a pending invoice and writes its outbox event', async () => {
    const result = await repository.cancelPendingInvoice(
      invoiceIds[0],
      tenantId,
    );

    expect(result?.invoiceNumber).toBe(invoiceIds[0]);
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceIds[0] },
    });
    expect(invoice?.status).toBe('CANCELLED');
    expect(
      await prisma.outboxEvent.findFirst({
        where: { tenantId, type: DOMAIN_EVENTS.INVOICE_CANCELLED },
      }),
    ).not.toBeNull();
  });

  it('does not cancel invoices with active provider attempts or paid status', async () => {
    await prisma.xenditPaymentRequestAttempt.create({
      data: {
        invoiceId: invoiceIds[1],
        tenantId,
        state: XenditPaymentRequestAttemptState.IN_PROGRESS,
      },
    });

    await expect(
      repository.cancelPendingInvoice(invoiceIds[1], tenantId),
    ).resolves.toBeNull();
    await expect(
      repository.cancelPendingInvoice(invoiceIds[2], tenantId),
    ).resolves.toBeNull();

    const [activeInvoice, paidInvoice, cancellationEvents] = await Promise.all([
      prisma.invoice.findUnique({ where: { id: invoiceIds[1] } }),
      prisma.invoice.findUnique({ where: { id: invoiceIds[2] } }),
      prisma.outboxEvent.count({
        where: { tenantId, type: DOMAIN_EVENTS.INVOICE_CANCELLED },
      }),
    ]);
    expect(activeInvoice?.status).toBe('PENDING');
    expect(paidInvoice?.status).toBe('PAID');
    expect(cancellationEvents).toBe(0);
  });
});
