import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { requestContext } from '../../core/request-context/request-context';
import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { BillingRepository } from './billing.repository';

const prisma = new PrismaClient();
const repository = new BillingRepository(prisma as never);
const tenantAwarePrisma = new PrismaService();
const tenantAwareRepository = new BillingRepository(tenantAwarePrisma);
const runId = `${process.pid}-${Date.now()}`;
const tenantId = `it-autopay-tenant-${runId}`;
const invoiceId = `it-autopay-invoice-${runId}`;
const referenceId = `it-autopay-enrollment-${runId}`;
const tokenId = `it-autopay-token-${runId}`;

async function cleanup() {
  await prisma.autopayChargeAttempt.deleteMany({ where: { tenantId } });
  await prisma.xenditWebhookReceipt.deleteMany({
    where: {
      OR: [{ paymentId: tokenId }, { referenceId }],
    },
  });
  await prisma.autopayPaymentMethod.deleteMany({ where: { tenantId } });
  await prisma.invoice.deleteMany({ where: { id: invoiceId, tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

describe('Autopay PostgreSQL integration', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await tenantAwarePrisma.onModuleInit();
  });

  beforeEach(async () => {
    await cleanup();
    await prisma.tenant.create({
      data: { id: tenantId, name: 'Autopay integration tenant' },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await tenantAwarePrisma.$disconnect();
  });

  it('persists consent and processes token activation idempotently before local revocation', async () => {
    const enrollment = await repository.createAutopayEnrollment({
      tenantId,
      referenceId,
      channelCode: 'CARD',
      currency: 'IDR',
      consentVersion: 'AUTOPAY_TERMS_V1',
      consentUserId: `it-autopay-user-${runId}`,
    });
    await expect(
      repository.recordAutopayEnrollmentSession(
        enrollment.id,
        tenantId,
        `it-autopay-session-${runId}`,
      ),
    ).resolves.toMatchObject({ count: 1 });
    const idempotencyKey = createHash('sha256')
      .update(`activation-${runId}`)
      .digest('hex');
    const encryptedToken = {
      ciphertext: 'encrypted-token-value',
      iv: 'random-iv',
      authTag: 'authentication-tag',
      keyVersion: 'test-v1',
      fingerprint: 'token-fingerprint',
    };

    await expect(
      repository.processXenditPaymentTokenWebhookEvent({
        idempotencyKey,
        eventType: 'payment_token.activation',
        paymentTokenId: tokenId,
        referenceId,
        paymentSessionId: `it-autopay-session-${runId}`,
        channelCode: 'CARD',
        currency: 'IDR',
        status: 'ACTIVE',
        encryptedToken,
      }),
    ).resolves.toBe('PROCESSED');
    await expect(
      repository.processXenditPaymentTokenWebhookEvent({
        idempotencyKey,
        eventType: 'payment_token.activation',
        paymentTokenId: tokenId,
        referenceId,
        paymentSessionId: `it-autopay-session-${runId}`,
        channelCode: 'CARD',
        currency: 'IDR',
        status: 'ACTIVE',
        encryptedToken,
      }),
    ).resolves.toBe('DUPLICATE');

    const activeMethod = await prisma.autopayPaymentMethod.findUnique({
      where: { id: enrollment.id },
    });
    expect(activeMethod).toMatchObject({
      status: 'ACTIVE',
      consentVersion: 'AUTOPAY_TERMS_V1',
      consentUserId: `it-autopay-user-${runId}`,
      providerPaymentTokenIdCiphertext: encryptedToken.ciphertext,
      tokenFingerprint: encryptedToken.fingerprint,
    });

    await expect(
      repository.revokeAutopayPaymentMethod(tenantId),
    ).resolves.toMatchObject({ status: 'REVOKED' });
    const revokedMethod = await prisma.autopayPaymentMethod.findUnique({
      where: { id: enrollment.id },
    });
    expect(revokedMethod).toMatchObject({
      status: 'REVOKED',
      providerPaymentTokenIdCiphertext: null,
      encryptionIv: null,
      encryptionAuthTag: null,
      encryptionKeyVersion: null,
    });
  });

  it('serializes concurrent claims and enforces a maximum of three attempts', async () => {
    await prisma.autopayPaymentMethod.create({
      data: {
        tenantId,
        referenceId,
        channelCode: 'CARD',
        currency: 'IDR',
        status: 'ACTIVE',
        consentAt: new Date(),
        consentVersion: 'AUTOPAY_TERMS_V1',
        consentUserId: `it-autopay-user-${runId}`,
        providerPaymentTokenIdCiphertext: 'encrypted-token-value',
        encryptionIv: 'random-iv',
        encryptionAuthTag: 'authentication-tag',
        encryptionKeyVersion: 'test-v1',
      },
    });
    await prisma.invoice.create({
      data: {
        id: invoiceId,
        tenantId,
        subscriptionId: `it-autopay-subscription-${runId}`,
        invoiceNumber: invoiceId,
        amountCents: 5000,
        currency: 'IDR',
        status: 'PENDING',
        dueAt: new Date(Date.now() - 60_000),
      },
    });

    const start = new Date();
    const cutoff = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [claimA, claimB] = await Promise.all([
      repository.claimAutopayChargeAttempt(invoiceId, tenantId, start, cutoff),
      repository.claimAutopayChargeAttempt(invoiceId, tenantId, start, cutoff),
    ]);
    const firstClaim = claimA ?? claimB;
    expect(firstClaim).not.toBeNull();
    expect(Number(claimA !== null) + Number(claimB !== null)).toBe(1);

    await expect(
      repository.claimAutopayChargeAttempt(
        invoiceId,
        `other-tenant-${runId}`,
        start,
        cutoff,
      ),
    ).resolves.toBeNull();

    let attempt = firstClaim!.attempt;
    for (let attemptNumber = 1; attemptNumber <= 3; attemptNumber += 1) {
      if (attemptNumber > 1) {
        const retryAt = new Date(
          start.getTime() + (attemptNumber - 1) * 24 * 60 * 60 * 1000,
        );
        const retry = await repository.claimAutopayChargeAttempt(
          invoiceId,
          tenantId,
          retryAt,
          new Date(retryAt.getTime() - 7 * 24 * 60 * 60 * 1000),
        );
        expect(retry?.attempt.attemptNumber).toBe(attemptNumber);
        attempt = retry!.attempt;
      } else {
        expect(attempt.attemptNumber).toBe(1);
      }

      await repository.failAutopayChargeAttempt(
        attempt.id,
        tenantId,
        'FAILED',
        'PROVIDER_REJECTED',
        new Date(start.getTime() + (attemptNumber - 1) * 24 * 60 * 60 * 1000),
      );
    }

    const afterLimit = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000);
    await expect(
      repository.claimAutopayChargeAttempt(
        invoiceId,
        tenantId,
        afterLimit,
        new Date(afterLimit.getTime() - 7 * 24 * 60 * 60 * 1000),
      ),
    ).resolves.toBeNull();
    await expect(
      prisma.autopayChargeAttempt.count({ where: { invoiceId, tenantId } }),
    ).resolves.toBe(3);
  });

  it('scans only eligible autopay invoices under the scheduler system context', async () => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    await prisma.autopayPaymentMethod.create({
      data: {
        tenantId,
        referenceId,
        channelCode: 'CARDS',
        currency: 'IDR',
        status: 'ACTIVE',
        consentAt: now,
        consentVersion: 'AUTOPAY_TERMS_V1',
        consentUserId: `it-autopay-user-${runId}`,
        providerPaymentTokenIdCiphertext: 'encrypted-token-value',
        encryptionIv: 'random-iv',
        encryptionAuthTag: 'authentication-tag',
        encryptionKeyVersion: 'test-v1',
      },
    });
    await prisma.invoice.create({
      data: {
        id: invoiceId,
        tenantId,
        subscriptionId: `it-autopay-subscription-${runId}`,
        invoiceNumber: invoiceId,
        amountCents: 5000,
        currency: 'IDR',
        status: 'PENDING',
        dueAt: new Date(now.getTime() - 60_000),
      },
    });

    await expect(
      requestContext.run({ systemOperation: 'subscription-autopay' }, () =>
        tenantAwareRepository.findAutopayInvoices(cutoff, now, 100),
      ),
    ).resolves.toMatchObject([
      {
        id: invoiceId,
        tenantId,
        paymentMethod: { channelCode: 'CARDS' },
      },
    ]);
  });

  it('expires retry windows from the scheduler without bypassing tenant isolation', async () => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    await prisma.invoice.create({
      data: {
        id: invoiceId,
        tenantId,
        subscriptionId: `it-autopay-subscription-${runId}`,
        invoiceNumber: invoiceId,
        amountCents: 5000,
        currency: 'IDR',
        status: 'PENDING',
        createdAt: new Date(cutoff.getTime() - 1000),
        dueAt: new Date(cutoff.getTime() - 1000),
      },
    });
    await prisma.autopayChargeAttempt.create({
      data: {
        tenantId,
        invoiceId,
        attemptNumber: 1,
        referenceId: `${referenceId}-attempt-1`,
        status: 'FAILED',
      },
    });

    await expect(
      requestContext.run({ systemOperation: 'subscription-autopay' }, () =>
        tenantAwareRepository.expireAutopayRetryWindow(cutoff, now),
      ),
    ).resolves.toBe(1);

    await expect(
      prisma.invoice.findUnique({ where: { id: invoiceId } }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      providerStatus: 'AUTOPAY_RETRY_WINDOW_EXPIRED',
    });
    await expect(
      prisma.outboxEvent.count({
        where: {
          tenantId,
          type: 'invoice.failed',
        },
      }),
    ).resolves.toBe(1);
    await expect(
      requestContext.run({ systemOperation: 'subscription-autopay' }, () =>
        tenantAwarePrisma.invoice.findMany({
          where: { status: 'PENDING' },
          take: 100,
        }),
      ),
    ).rejects.toThrow('TENANT_CONTEXT_MISSING');
  });
});
