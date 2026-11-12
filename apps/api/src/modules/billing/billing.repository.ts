import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Invoice } from '@prisma/client';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { DOMAIN_EVENTS } from '../../core/events/domain-events';
import { requestContext } from '../../core/request-context/request-context';
import { InvoiceExportCursor, InvoiceExportRow } from './invoice-export';

export type InvoiceRecord = Prisma.InvoiceGetPayload<{
  include: { tenant: true };
}>;

type InvoiceCreateData = Omit<
  Prisma.InvoiceUncheckedCreateInput,
  'invoiceNumber'
>;

type XenditWebhookInput = {
  idempotencyKey: string;
  eventType: string;
  eventCreatedAt: string;
  providerUpdatedAt: string;
  paymentRequestId?: string;
  referenceId?: string;
  paymentId: string;
  amount?: number;
  currency?: string;
  status?: string;
  captureIds?: string[];
  metadata?: Record<string, unknown>;
};

type XenditRefundWebhookInput = {
  idempotencyKey: string;
  eventType: string;
  refundId: string;
  referenceId: string;
  amount: number;
  currency: string;
  status: string;
};

export type AutopayPolicy = {
  enabled: boolean;
  mitChannelAllowlist: string[];
};

export type AutopayInvoiceCandidate = {
  id: string;
  tenantId: string;
  subscriptionId: string | null;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  createdAt: Date;
  paymentMethod: {
    providerPaymentTokenIdCiphertext: string;
    encryptionIv: string;
    encryptionAuthTag: string;
    encryptionKeyVersion: string;
    channelCode: string;
  };
};

@Injectable()
export class BillingRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async findInvoiceById(id: string, tenantId: string) {
    return this.prisma.invoice.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  async expireAutopayRetryWindow(cutoff: Date, now: Date) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: 'PENDING',
        deletedAt: null,
        subscriptionId: { not: null },
        createdAt: { lt: cutoff },
        autopayAttempts: { some: {} },
      },
      select: {
        id: true,
        tenantId: true,
        subscriptionId: true,
        invoiceNumber: true,
        amountCents: true,
        autopayAttempts: {
          orderBy: { attemptNumber: 'desc' },
          take: 1,
          select: { status: true },
        },
      },
      take: 100,
    });

    let expiredCount = 0;
    for (const invoice of invoices) {
      if (invoice.autopayAttempts[0]?.status !== 'FAILED') continue;
      const expired = await requestContext.run(
        {
          tenantId: invoice.tenantId,
          systemOperation: 'subscription-autopay',
        },
        () =>
          this.prisma.$transaction(async (tx) => {
            const updated = await tx.invoice.updateMany({
              where: {
                id: invoice.id,
                tenantId: invoice.tenantId,
                status: 'PENDING',
                createdAt: { lt: cutoff },
              },
              data: {
                status: 'FAILED',
                providerStatus: 'AUTOPAY_RETRY_WINDOW_EXPIRED',
              },
            });
            if (updated.count !== 1) return false;

            if (invoice.subscriptionId) {
              const subscriptionUpdate = await tx.subscription.updateMany({
                where: {
                  id: invoice.subscriptionId,
                  tenantId: invoice.tenantId,
                  status: { in: ['ACTIVE', 'PAST_DUE'] },
                },
                data: { status: 'PAST_DUE' },
              });
              if (subscriptionUpdate.count === 1) {
                await tx.outboxEvent.create({
                  data: {
                    tenantId: invoice.tenantId,
                    type: DOMAIN_EVENTS.SUBSCRIPTION_PAST_DUE,
                    payload: JSON.stringify({
                      type: DOMAIN_EVENTS.SUBSCRIPTION_PAST_DUE,
                      payload: {
                        subscriptionId: invoice.subscriptionId,
                        tenantId: invoice.tenantId,
                        dueAmountCents: invoice.amountCents,
                      },
                      occurredAt: now,
                    }),
                    status: 'PENDING',
                  },
                });
              }
            }
            await tx.outboxEvent.create({
              data: {
                tenantId: invoice.tenantId,
                type: DOMAIN_EVENTS.INVOICE_FAILED,
                payload: JSON.stringify({
                  type: DOMAIN_EVENTS.INVOICE_FAILED,
                  payload: {
                    invoiceId: invoice.id,
                    invoiceNumber: invoice.invoiceNumber,
                    tenantId: invoice.tenantId,
                    subscriptionId: invoice.subscriptionId,
                    amountCents: invoice.amountCents,
                    reason: 'AUTOPAY_RETRY_WINDOW_EXPIRED',
                  },
                }),
                status: 'PENDING',
              },
            });
            return true;
          }),
      );
      if (expired) expiredCount += 1;
    }
    return expiredCount;
  }

  async findInvoiceByNumber(invoiceNumber: string, tenantId: string) {
    return this.prisma.invoice.findFirst({
      where: { invoiceNumber, tenantId, deletedAt: null },
    });
  }

  async findInvoiceByProviderReference(referenceId: string, tenantId: string) {
    return this.prisma.invoice.findFirst({
      where: {
        providerReferenceId: referenceId,
        tenantId,
        deletedAt: null,
      },
    });
  }

  async findInvoiceByProviderPaymentRequestId(
    paymentRequestId: string,
    tenantId: string,
  ) {
    return this.prisma.invoice.findFirst({
      where: {
        providerPaymentRequestId: paymentRequestId,
        tenantId,
        deletedAt: null,
      },
    });
  }

  async findXenditPaymentRequestAttempt(invoiceId: string, tenantId: string) {
    return this.prisma.xenditPaymentRequestAttempt.findFirst({
      where: { invoiceId, tenantId },
    });
  }

  async findInvoiceRefunds(invoiceId: string, tenantId: string) {
    return this.prisma.invoiceRefund.findMany({
      where: { invoiceId, tenantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        amountCents: true,
        currency: true,
        reason: true,
        status: true,
        providerStatus: true,
        createdAt: true,
        processedAt: true,
      },
    });
  }

  async findInvoiceRefundById(id: string, tenantId: string) {
    return this.prisma.invoiceRefund.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        invoiceId: true,
        referenceId: true,
        amountCents: true,
        currency: true,
        reason: true,
        status: true,
        providerStatus: true,
        createdAt: true,
        processedAt: true,
      },
    });
  }

  async getAutopayPolicy(): Promise<AutopayPolicy> {
    const records = await this.prisma.platformSetting.findMany({
      where: { key: { in: ['autopayEnabled', 'mitChannelAllowlist'] } },
      select: { key: true, value: true },
    });
    const values = new Map(records.map((record) => [record.key, record.value]));
    return {
      enabled: values.get('autopayEnabled') === 'true',
      mitChannelAllowlist: (values.get('mitChannelAllowlist') ?? '')
        .split(',')
        .map((channel) => channel.trim().toUpperCase())
        .filter(Boolean),
    };
  }

  async findAutopayPaymentMethod(tenantId: string) {
    return this.prisma.autopayPaymentMethod.findFirst({
      where: { tenantId, status: { in: ['PENDING', 'ACTIVE'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        channelCode: true,
        currency: true,
        status: true,
        consentAt: true,
        revokedAt: true,
      },
    });
  }

  async createAutopayEnrollment(input: {
    tenantId: string;
    invoiceId?: string;
    referenceId: string;
    channelCode: string;
    currency: string;
    consentVersion: string;
    consentUserId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Tenant" WHERE "id" = ${input.tenantId} FOR UPDATE
      `;
      if (tenant.length !== 1) throw new NotFoundException('Tenant not found');
      const existing = await tx.autopayPaymentMethod.findFirst({
        where: {
          tenantId: input.tenantId,
          status: { in: ['PENDING', 'ACTIVE'] },
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(
          'An active or pending autopay payment method already exists',
        );
      }
      return tx.autopayPaymentMethod.create({
        data: {
          ...input,
          consentAt: new Date(),
          status: 'PENDING',
        },
        select: {
          id: true,
          referenceId: true,
          channelCode: true,
          currency: true,
          status: true,
          consentAt: true,
        },
      });
    });
  }

  async recordAutopayEnrollmentRequest(
    id: string,
    tenantId: string,
    paymentRequestId: string,
  ) {
    return this.prisma.autopayPaymentMethod.updateMany({
      where: { id, tenantId, status: 'PENDING' },
      data: { providerPaymentRequestId: paymentRequestId },
    });
  }

  async recordAutopayEnrollmentSession(
    id: string,
    tenantId: string,
    paymentSessionId: string,
  ) {
    return this.prisma.autopayPaymentMethod.updateMany({
      where: { id, tenantId, status: 'PENDING' },
      data: { providerPaymentSessionId: paymentSessionId },
    });
  }

  async failAutopayEnrollment(id: string, tenantId: string) {
    return this.prisma.autopayPaymentMethod.updateMany({
      where: { id, tenantId, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
  }

  async revokeAutopayPaymentMethod(tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      const method = await tx.autopayPaymentMethod.findFirst({
        where: { tenantId, status: { in: ['PENDING', 'ACTIVE'] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      if (!method)
        throw new NotFoundException('Autopay payment method not found');
      await tx.autopayPaymentMethod.updateMany({
        where: {
          id: method.id,
          tenantId,
          status: { in: ['PENDING', 'ACTIVE'] },
        },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          providerPaymentTokenIdCiphertext: null,
          encryptionIv: null,
          encryptionAuthTag: null,
          encryptionKeyVersion: null,
          tokenFingerprint: null,
        },
      });
      return {
        id: method.id,
        status: 'REVOKED',
        providerRevocation: 'UNSUPPORTED',
      };
    });
  }

  async processXenditPaymentTokenWebhookEvent(input: {
    idempotencyKey: string;
    eventType: string;
    paymentTokenId: string;
    referenceId: string;
    paymentSessionId?: string;
    channelCode?: string;
    currency?: string;
    status: string;
    encryptedToken?: {
      ciphertext: string;
      iv: string;
      authTag: string;
      keyVersion: string;
      fingerprint: string;
    };
  }): Promise<'PROCESSED' | 'DUPLICATE' | 'IGNORED'> {
    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.xenditWebhookReceipt.createMany({
        data: [
          {
            idempotencyKey: input.idempotencyKey,
            paymentId: input.paymentTokenId,
            referenceId: input.referenceId,
            eventType: input.eventType,
            paymentStatus: input.status,
          },
        ],
        skipDuplicates: true,
      });
      if (receipt.count === 0) return 'DUPLICATE';

      const method = await tx.autopayPaymentMethod.findUnique({
        where: { referenceId: input.referenceId },
      });
      if (!method) {
        throw new NotFoundException(
          'Xendit payment token does not match an autopay enrollment',
        );
      }
      if (
        input.paymentSessionId &&
        method.providerPaymentSessionId !== input.paymentSessionId
      ) {
        if (method.providerPaymentSessionId || method.status !== 'PENDING') {
          throw new ConflictException(
            'Xendit payment session does not match the autopay enrollment',
          );
        }
        const linkedSession = await tx.autopayPaymentMethod.updateMany({
          where: {
            id: method.id,
            status: 'PENDING',
            providerPaymentSessionId: null,
          },
          data: { providerPaymentSessionId: input.paymentSessionId },
        });
        if (linkedSession.count !== 1) {
          throw new ConflictException(
            'Xendit payment session could not be linked to the autopay enrollment',
          );
        }
      }
      if (
        (input.channelCode && method.channelCode !== input.channelCode) ||
        (input.currency && method.currency.trim() !== input.currency)
      ) {
        throw new ConflictException(
          'Xendit payment token channel or currency does not match enrollment',
        );
      }

      let nextStatus: 'ACTIVE' | 'FAILED' | 'EXPIRED';
      if (
        input.eventType === 'payment_token.activation' &&
        input.status === 'ACTIVE'
      ) {
        nextStatus = 'ACTIVE';
      } else if (
        input.eventType === 'payment_token.failure' &&
        input.status === 'FAILED'
      ) {
        nextStatus = 'FAILED';
      } else if (
        input.eventType === 'payment_token.expiry' &&
        input.status === 'EXPIRED'
      ) {
        nextStatus = 'EXPIRED';
      } else {
        throw new BadRequestException(
          'Xendit payment token event and status are not a supported pair',
        );
      }

      if (method.status === 'REVOKED') {
        await tx.xenditWebhookReceipt.update({
          where: { idempotencyKey: input.idempotencyKey },
          data: { outcome: 'IGNORED', processedAt: new Date() },
        });
        return 'IGNORED';
      }
      if (method.status === 'ACTIVE' && nextStatus === 'ACTIVE') {
        const sameToken =
          method.tokenFingerprint === input.encryptedToken?.fingerprint;
        if (!sameToken) {
          throw new ConflictException(
            'Xendit activated a different payment token for an active enrollment',
          );
        }
        await tx.xenditWebhookReceipt.update({
          where: { idempotencyKey: input.idempotencyKey },
          data: { outcome: 'PROCESSED', processedAt: new Date() },
        });
        return 'PROCESSED';
      }
      const activeTokenTerminalEvent =
        method.status === 'ACTIVE' &&
        (nextStatus === 'FAILED' || nextStatus === 'EXPIRED');
      if (method.status !== 'PENDING' && !activeTokenTerminalEvent) {
        await tx.xenditWebhookReceipt.update({
          where: { idempotencyKey: input.idempotencyKey },
          data: { outcome: 'IGNORED', processedAt: new Date() },
        });
        return 'IGNORED';
      }
      if (nextStatus === 'ACTIVE' && !input.encryptedToken) {
        throw new BadRequestException(
          'Active Xendit payment token could not be encrypted',
        );
      }

      await tx.autopayPaymentMethod.update({
        where: { id: method.id },
        data: {
          status: nextStatus,
          ...(input.encryptedToken
            ? {
                providerPaymentTokenIdCiphertext:
                  input.encryptedToken.ciphertext,
                encryptionIv: input.encryptedToken.iv,
                encryptionAuthTag: input.encryptedToken.authTag,
                encryptionKeyVersion: input.encryptedToken.keyVersion,
                tokenFingerprint: input.encryptedToken.fingerprint,
              }
            : {}),
          ...(nextStatus !== 'ACTIVE'
            ? {
                providerPaymentTokenIdCiphertext: null,
                encryptionIv: null,
                encryptionAuthTag: null,
                encryptionKeyVersion: null,
                tokenFingerprint: null,
              }
            : {}),
          ...(nextStatus === 'EXPIRED' ? { revokedAt: new Date() } : {}),
        },
      });
      await tx.xenditWebhookReceipt.update({
        where: { idempotencyKey: input.idempotencyKey },
        data: { outcome: 'PROCESSED', processedAt: new Date() },
      });
      return 'PROCESSED';
    });
  }

  async expireAutopayPaymentSession(input: {
    paymentSessionId: string;
    referenceId: string;
  }): Promise<'PROCESSED' | 'IGNORED'> {
    return this.prisma.$transaction(async (tx) => {
      const method = await tx.autopayPaymentMethod.findFirst({
        where: {
          referenceId: input.referenceId,
          OR: [
            { providerPaymentSessionId: input.paymentSessionId },
            { providerPaymentSessionId: null },
          ],
        },
      });
      if (!method) {
        throw new NotFoundException(
          'Xendit payment session does not match an autopay enrollment',
        );
      }
      if (!method.providerPaymentSessionId) {
        await tx.autopayPaymentMethod.updateMany({
          where: {
            id: method.id,
            status: 'PENDING',
            providerPaymentSessionId: null,
          },
          data: { providerPaymentSessionId: input.paymentSessionId },
        });
      }
      if (method.status !== 'PENDING') return 'IGNORED';

      await tx.autopayPaymentMethod.updateMany({
        where: { id: method.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      if (method.invoiceId) {
        await tx.xenditPaymentRequestAttempt.updateMany({
          where: {
            invoiceId: method.invoiceId,
            tenantId: method.tenantId,
            state: 'IN_PROGRESS',
            providerPaymentRequestId: null,
          },
          data: { state: 'REJECTED' },
        });
      }
      return 'PROCESSED';
    });
  }

  async findAutopayInvoices(cutoff: Date, now: Date, take = 100) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: 'PENDING',
        deletedAt: null,
        subscriptionId: { not: null },
        createdAt: { gte: cutoff },
        xenditPaymentRequestAttempt: { is: null },
        AND: [
          {
            OR: [{ dueAt: null }, { dueAt: { lte: now } }],
          },
          {
            OR: [
              {
                providerPaymentRequestId: null,
                providerPaymentId: null,
              },
              { autopayAttempts: { some: {} } },
            ],
          },
        ],
        tenant: {
          is: {
            AutopayPaymentMethod: { some: { status: 'ACTIVE' } },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
      include: {
        tenant: {
          include: {
            AutopayPaymentMethod: {
              where: { status: 'ACTIVE' },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
            },
          },
        },
      },
    });
    return invoices.flatMap((invoice): AutopayInvoiceCandidate[] => {
      const method = invoice.tenant.AutopayPaymentMethod[0];
      if (
        !method ||
        !method.providerPaymentTokenIdCiphertext ||
        !method.encryptionIv ||
        !method.encryptionAuthTag ||
        !method.encryptionKeyVersion
      ) {
        return [];
      }
      return [
        {
          id: invoice.id,
          tenantId: invoice.tenantId,
          subscriptionId: invoice.subscriptionId,
          invoiceNumber: invoice.invoiceNumber,
          amountCents: invoice.amountCents,
          currency: invoice.currency,
          createdAt: invoice.createdAt,
          paymentMethod: {
            providerPaymentTokenIdCiphertext:
              method.providerPaymentTokenIdCiphertext,
            encryptionIv: method.encryptionIv,
            encryptionAuthTag: method.encryptionAuthTag,
            encryptionKeyVersion: method.encryptionKeyVersion,
            channelCode: method.channelCode,
          },
        },
      ];
    });
  }

  async claimAutopayChargeAttempt(
    invoiceId: string,
    tenantId: string,
    now: Date,
    cutoff: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const invoiceRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Invoice"
        WHERE "id" = ${invoiceId}
          AND "tenantId" = ${tenantId}
          AND "status" = 'PENDING'
          AND "deletedAt" IS NULL
          AND "createdAt" >= ${cutoff}
          AND ("dueAt" IS NULL OR "dueAt" <= ${now})
          AND NOT EXISTS (
            SELECT 1
            FROM "XenditPaymentRequestAttempt" AS "paymentAttempt"
            WHERE "paymentAttempt"."invoiceId" = "Invoice"."id"
              AND "paymentAttempt"."tenantId" = "Invoice"."tenantId"
          )
          AND (
            ("providerPaymentRequestId" IS NULL AND "providerPaymentId" IS NULL)
            OR EXISTS (
              SELECT 1
              FROM "AutopayChargeAttempt" AS "autopayAttempt"
              WHERE "autopayAttempt"."invoiceId" = "Invoice"."id"
                AND "autopayAttempt"."tenantId" = "Invoice"."tenantId"
            )
          )
        FOR UPDATE
      `;
      if (invoiceRows.length !== 1) return null;

      const method = await tx.autopayPaymentMethod.findFirst({
        where: { tenantId, status: 'ACTIVE' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      if (
        !method?.providerPaymentTokenIdCiphertext ||
        !method.encryptionIv ||
        !method.encryptionAuthTag ||
        !method.encryptionKeyVersion
      ) {
        return null;
      }

      const lastAttempt = await tx.autopayChargeAttempt.findFirst({
        where: { invoiceId, tenantId },
        orderBy: { attemptNumber: 'desc' },
      });
      let attemptNumber = 1;
      if (lastAttempt) {
        if (
          lastAttempt.status !== 'FAILED' ||
          lastAttempt.attemptNumber >= 3 ||
          !lastAttempt.nextAttemptAt ||
          lastAttempt.nextAttemptAt > now
        ) {
          return null;
        }
        attemptNumber = lastAttempt.attemptNumber + 1;
      }

      const attempt = await tx.autopayChargeAttempt.create({
        data: {
          tenantId,
          invoiceId,
          attemptNumber,
          referenceId: `ap-${crypto.randomUUID()}`,
          status: 'IN_PROGRESS',
        },
      });
      return {
        attempt,
        invoice: await tx.invoice.findFirstOrThrow({
          where: { id: invoiceId, tenantId },
          select: {
            id: true,
            invoiceNumber: true,
            amountCents: true,
            currency: true,
          },
        }),
        paymentMethod: {
          providerPaymentTokenIdCiphertext:
            method.providerPaymentTokenIdCiphertext,
          encryptionIv: method.encryptionIv,
          encryptionAuthTag: method.encryptionAuthTag,
          encryptionKeyVersion: method.encryptionKeyVersion,
          channelCode: method.channelCode,
        },
      };
    });
  }

  async completeAutopayChargeRequest(
    id: string,
    tenantId: string,
    paymentRequestId: string,
  ) {
    return this.prisma.autopayChargeAttempt.updateMany({
      where: { id, tenantId, status: 'IN_PROGRESS' },
      data: { status: 'PENDING', providerPaymentRequestId: paymentRequestId },
    });
  }

  async failAutopayChargeAttempt(
    id: string,
    tenantId: string,
    state: 'FAILED' | 'UNKNOWN',
    errorCategory: string,
    now = new Date(),
  ) {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.autopayChargeAttempt.findFirst({
        where: { id, tenantId, status: 'IN_PROGRESS' },
        include: { invoice: true },
      });
      if (!attempt) return null;

      const scheduledRetryAt =
        state === 'FAILED' &&
        attempt.attemptNumber < 3 &&
        attempt.invoice.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000 >
          now.getTime()
          ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
          : null;
      const retryWindowEnd = new Date(
        attempt.invoice.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000,
      );
      const nextAttemptAt =
        scheduledRetryAt && scheduledRetryAt < retryWindowEnd
          ? scheduledRetryAt
          : null;
      return tx.autopayChargeAttempt.update({
        where: { id },
        data: {
          status: state,
          errorCategory,
          nextAttemptAt,
          processedAt: now,
        },
      });
    });
  }

  async claimInvoiceRefund(input: {
    invoiceId: string;
    tenantId: string;
    amountCents: number;
    reason: string;
    actorType: string;
    actorId: string;
    referenceId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Invoice"
        WHERE "id" = ${input.invoiceId}
          AND "tenantId" = ${input.tenantId}
          AND "deletedAt" IS NULL
          AND "status" IN ('PAID', 'PARTIALLY_REFUNDED')
        FOR UPDATE
      `;
      if (locked.length !== 1) {
        throw new ConflictException('Only paid invoices can be refunded');
      }

      const invoice = await tx.invoice.findFirst({
        where: {
          id: input.invoiceId,
          tenantId: input.tenantId,
          deletedAt: null,
        },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (!invoice.providerPaymentRequestId || !invoice.providerPaymentId) {
        throw new ConflictException(
          'Invoice is missing verified provider payment correlation',
        );
      }

      const reserved = await tx.invoiceRefund.aggregate({
        where: {
          invoiceId: input.invoiceId,
          tenantId: input.tenantId,
          status: { in: ['PENDING', 'UNKNOWN', 'SUCCEEDED'] },
        },
        _sum: { amountCents: true },
      });
      const alreadyReserved = reserved._sum.amountCents ?? 0;
      if (
        !Number.isSafeInteger(input.amountCents) ||
        input.amountCents <= 0 ||
        alreadyReserved + input.amountCents > invoice.amountCents
      ) {
        throw new ConflictException(
          'Refund amount exceeds the remaining refundable payment balance',
        );
      }

      return tx.invoiceRefund.create({
        data: {
          tenantId: input.tenantId,
          invoiceId: input.invoiceId,
          amountCents: input.amountCents,
          currency: invoice.currency,
          reason: input.reason,
          actorType: input.actorType,
          actorId: input.actorId,
          referenceId: input.referenceId,
          status: 'PENDING',
        },
      });
    });
  }

  async recordInvoiceRefundOutcome(
    id: string,
    tenantId: string,
    outcome: 'PENDING' | 'UNKNOWN' | 'FAILED',
    providerRefundId?: string,
    providerStatus?: string,
  ) {
    return this.prisma.invoiceRefund.updateMany({
      where: { id, tenantId, status: 'PENDING' },
      data: {
        status: outcome,
        ...(providerRefundId ? { providerRefundId } : {}),
        ...(providerStatus ? { providerStatus } : {}),
        ...(outcome === 'FAILED' ? { processedAt: new Date() } : {}),
      },
    });
  }

  async claimXenditPaymentRequest(
    invoiceId: string,
    tenantId: string,
  ): Promise<{
    claimed: boolean;
    state?: 'IN_PROGRESS' | 'REJECTED' | 'UNKNOWN' | 'COMPLETED';
    paymentRequestId?: string | null;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const pendingInvoice = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Invoice"
        WHERE "id" = ${invoiceId}
          AND "tenantId" = ${tenantId}
          AND "status" = 'PENDING'
          AND "providerPaymentRequestId" IS NULL
          AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (pendingInvoice.length !== 1) return { claimed: false };

      const inserted = await tx.xenditPaymentRequestAttempt.createMany({
        data: [{ invoiceId, tenantId, state: 'IN_PROGRESS' }],
        skipDuplicates: true,
      });
      if (inserted.count === 1) return { claimed: true };

      const attempt = await tx.xenditPaymentRequestAttempt.findFirst({
        where: { invoiceId, tenantId },
      });
      if (!attempt) return { claimed: false };

      if (attempt.state === 'REJECTED') {
        const reclaimed = await tx.xenditPaymentRequestAttempt.updateMany({
          where: { invoiceId, tenantId, state: 'REJECTED' },
          data: { state: 'IN_PROGRESS' },
        });
        if (reclaimed.count === 1) return { claimed: true };
      }

      return {
        claimed: false,
        state: attempt.state,
        paymentRequestId: attempt.providerPaymentRequestId,
      };
    });
  }

  async completeXenditPaymentRequest(
    invoiceId: string,
    tenantId: string,
    referenceId: string,
    paymentRequestId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const updatedInvoice = await tx.invoice.updateMany({
        where: {
          id: invoiceId,
          tenantId,
          deletedAt: null,
          status: 'PENDING',
          providerPaymentRequestId: null,
        },
        data: {
          providerReferenceId: referenceId,
          providerPaymentRequestId: paymentRequestId,
          providerStatus: 'PENDING',
        },
      });
      if (updatedInvoice.count !== 1) {
        throw new ConflictException(
          'Invoice changed before Xendit payment correlation was persisted',
        );
      }

      const completedAttempt = await tx.xenditPaymentRequestAttempt.updateMany({
        where: {
          invoiceId,
          tenantId,
          state: { in: ['IN_PROGRESS', 'UNKNOWN'] },
          OR: [
            { providerPaymentRequestId: null },
            { providerPaymentRequestId: paymentRequestId },
          ],
        },
        data: {
          state: 'COMPLETED',
          providerPaymentRequestId: paymentRequestId,
        },
      });
      if (completedAttempt.count !== 1) {
        throw new ConflictException(
          'Xendit payment-request creation attempt is not available to complete',
        );
      }
    });
  }

  async recordXenditPaymentRequestOutcome(
    invoiceId: string,
    tenantId: string,
    state: 'REJECTED' | 'UNKNOWN',
    paymentRequestId?: string,
  ) {
    return this.prisma.xenditPaymentRequestAttempt.updateMany({
      where: { invoiceId, tenantId, state: 'IN_PROGRESS' },
      data: {
        state,
        ...(paymentRequestId
          ? { providerPaymentRequestId: paymentRequestId }
          : {}),
      },
    });
  }

  async linkProviderCorrelation(
    invoiceId: string,
    tenantId: string,
    data: {
      providerReferenceId?: string;
      providerPaymentRequestId?: string;
      providerPaymentId?: string;
      providerEventId?: string;
      providerStatus?: string;
    },
  ) {
    return this.prisma.invoice.updateMany({
      where: { id: invoiceId, tenantId, deletedAt: null },
      data: {
        ...(data.providerReferenceId
          ? { providerReferenceId: data.providerReferenceId }
          : {}),
        ...(data.providerPaymentRequestId
          ? { providerPaymentRequestId: data.providerPaymentRequestId }
          : {}),
        ...(data.providerPaymentId
          ? { providerPaymentId: data.providerPaymentId }
          : {}),
        ...(data.providerEventId
          ? { providerEventId: data.providerEventId }
          : {}),
        ...(data.providerStatus ? { providerStatus: data.providerStatus } : {}),
      },
    });
  }

  async processXenditWebhookEvent(
    input: XenditWebhookInput,
  ): Promise<'PROCESSED' | 'DUPLICATE' | 'IGNORED'> {
    return this.prisma.$transaction(async (tx) => {
      const receiptInsert = await tx.xenditWebhookReceipt.createMany({
        data: [
          {
            idempotencyKey: input.idempotencyKey,
            paymentRequestId: input.paymentRequestId,
            paymentId: input.paymentId,
            referenceId: input.referenceId,
            eventType: input.eventType,
            paymentStatus: input.status ?? 'UNKNOWN',
          },
        ],
        skipDuplicates: true,
      });

      if (receiptInsert.count === 0) return 'DUPLICATE';

      const autopayAttempt = await tx.autopayChargeAttempt.findFirst({
        where: {
          OR: [
            ...(input.paymentRequestId
              ? [{ providerPaymentRequestId: input.paymentRequestId }]
              : []),
            { providerPaymentId: input.paymentId },
            ...(input.referenceId ? [{ referenceId: input.referenceId }] : []),
          ],
        },
        include: { invoice: true },
      });
      const autopayEnrollment =
        !autopayAttempt && input.referenceId
          ? await tx.autopayPaymentMethod.findFirst({
              where: {
                referenceId: input.referenceId,
                invoiceId: { not: null },
              },
              include: { invoice: true },
            })
          : null;
      const matches = await Promise.all([
        input.paymentRequestId
          ? tx.invoice.findFirst({
              where: {
                providerPaymentRequestId: input.paymentRequestId,
                deletedAt: null,
              },
            })
          : Promise.resolve(null),
        tx.invoice.findFirst({
          where: { providerPaymentId: input.paymentId, deletedAt: null },
        }),
        input.referenceId
          ? tx.invoice.findFirst({
              where: {
                providerReferenceId: input.referenceId,
                deletedAt: null,
              },
            })
          : Promise.resolve(null),
        input.referenceId
          ? tx.invoice.findFirst({
              where: { invoiceNumber: input.referenceId, deletedAt: null },
            })
          : Promise.resolve(null),
      ]);
      const providerMatches = matches
        .slice(0, 2)
        .filter(
          (invoice): invoice is NonNullable<typeof invoice> => invoice !== null,
        );
      if (
        providerMatches.length === 0 &&
        !autopayAttempt &&
        !autopayEnrollment?.invoice
      ) {
        throw new NotFoundException(
          'Xendit payment ID is not pre-correlated to an ERP invoice',
        );
      }
      const invoices = matches.filter(
        (invoice): invoice is NonNullable<typeof invoice> => invoice !== null,
      );
      if (autopayAttempt) invoices.push(autopayAttempt.invoice);
      if (autopayEnrollment?.invoice) invoices.push(autopayEnrollment.invoice);
      const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
      if (invoiceIds.size > 1) {
        throw new ConflictException(
          'Xendit identifiers resolve to different ERP invoices',
        );
      }

      const invoice =
        autopayAttempt?.invoice ?? autopayEnrollment?.invoice ?? invoices[0];
      if (!invoice) {
        throw new NotFoundException(
          'No ERP invoice matched the authenticated Xendit webhook',
        );
      }

      requestContext.set({ tenantId: invoice.tenantId });

      if (
        typeof input.amount !== 'number' ||
        !Number.isFinite(input.amount) ||
        !input.currency ||
        !input.status
      ) {
        throw new BadRequestException(
          'Xendit webhook is missing financial status, amount, or currency',
        );
      }
      if (invoice.amountCents !== input.amount) {
        throw new BadRequestException(
          'Provider amount does not match ERP invoice',
        );
      }
      if (invoice.currency !== input.currency) {
        throw new BadRequestException(
          'Provider currency does not match ERP invoice',
        );
      }
      if (autopayAttempt) {
        if (
          (autopayAttempt.providerPaymentRequestId &&
            input.paymentRequestId !==
              autopayAttempt.providerPaymentRequestId) ||
          input.referenceId !== autopayAttempt.referenceId ||
          (autopayAttempt.providerPaymentId &&
            input.paymentId !== autopayAttempt.providerPaymentId)
        ) {
          throw new ConflictException(
            'Xendit identifiers do not match the autopay charge attempt',
          );
        }
      } else if (autopayEnrollment) {
        if (
          autopayEnrollment.invoiceId !== invoice.id ||
          (invoice.providerPaymentRequestId &&
            input.paymentRequestId !== invoice.providerPaymentRequestId) ||
          (invoice.providerPaymentId &&
            input.paymentId !== invoice.providerPaymentId) ||
          (invoice.providerReferenceId &&
            input.referenceId !== invoice.providerReferenceId)
        ) {
          throw new ConflictException(
            'Xendit identifiers do not match the autopay enrollment invoice',
          );
        }
      } else if (
        (invoice.providerPaymentRequestId &&
          input.paymentRequestId !== invoice.providerPaymentRequestId) ||
        (invoice.providerPaymentId &&
          input.paymentId !== invoice.providerPaymentId) ||
        (invoice.providerReferenceId &&
          input.referenceId !== invoice.providerReferenceId)
      ) {
        throw new ConflictException(
          'Xendit identifiers do not match the existing ERP correlation',
        );
      }

      let transition: 'PAID' | 'FAILED' | 'NONE';
      if (
        input.eventType === 'payment.capture' &&
        input.status === 'SUCCEEDED'
      ) {
        transition = 'PAID';
      } else if (
        input.eventType === 'payment.failure' &&
        ['FAILED', 'EXPIRED', 'CANCELED'].includes(input.status)
      ) {
        transition = 'FAILED';
      } else if (
        input.eventType === 'payment.authorization' &&
        input.status === 'AUTHORIZED'
      ) {
        transition = 'NONE';
      } else {
        throw new BadRequestException(
          'Xendit event type and payment status are not a supported pair',
        );
      }

      if (transition === 'NONE' || invoice.status !== 'PENDING') {
        await tx.xenditWebhookReceipt.update({
          where: { idempotencyKey: input.idempotencyKey },
          data: { outcome: 'IGNORED', processedAt: new Date() },
        });
        return 'IGNORED';
      }

      const now = new Date();
      const retryAt =
        transition === 'FAILED' &&
        autopayAttempt &&
        autopayAttempt.attemptNumber < 3
          ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
          : null;
      const withinRetryWindow =
        retryAt !== null &&
        retryAt.getTime() <
          invoice.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000;
      if (autopayEnrollment && input.paymentRequestId) {
        const linkedAttempt = await tx.xenditPaymentRequestAttempt.updateMany({
          where: {
            invoiceId: invoice.id,
            tenantId: invoice.tenantId,
            state: { in: ['IN_PROGRESS', 'UNKNOWN', 'REJECTED', 'COMPLETED'] },
            OR: [
              { providerPaymentRequestId: null },
              { providerPaymentRequestId: input.paymentRequestId },
            ],
          },
          data: {
            state: 'COMPLETED',
            providerPaymentRequestId: input.paymentRequestId,
          },
        });
        if (linkedAttempt.count !== 1) {
          throw new ConflictException(
            'Xendit Payment Session invoice attempt is not available to complete',
          );
        }
      }
      if (autopayAttempt) {
        await tx.autopayChargeAttempt.updateMany({
          where: {
            id: autopayAttempt.id,
            tenantId: invoice.tenantId,
            status: { in: ['IN_PROGRESS', 'PENDING'] },
          },
          data: {
            status: transition === 'PAID' ? 'SUCCEEDED' : 'FAILED',
            providerPaymentId: input.paymentId,
            processedAt: now,
            nextAttemptAt: withinRetryWindow ? retryAt : null,
            errorCategory: transition === 'FAILED' ? input.status : null,
          },
        });
      }

      const deferInvoiceFailure =
        transition === 'FAILED' && autopayAttempt !== null && withinRetryWindow;
      const updated = await tx.invoice.updateMany({
        where: {
          id: invoice.id,
          tenantId: invoice.tenantId,
          deletedAt: null,
          status: 'PENDING',
        },
        data: {
          status: deferInvoiceFailure ? 'PENDING' : transition,
          ...(transition === 'PAID' ? { paidAt: now } : {}),
          providerReferenceId: input.referenceId,
          providerPaymentRequestId: input.paymentRequestId,
          providerPaymentId: input.paymentId,
          providerStatus: input.status,
        },
      });

      if (updated.count !== 1) {
        await tx.xenditWebhookReceipt.update({
          where: { idempotencyKey: input.idempotencyKey },
          data: { outcome: 'IGNORED', processedAt: new Date() },
        });
        return 'IGNORED';
      }

      if (transition === 'PAID') {
        if (invoice.subscriptionId) {
          await tx.subscription.updateMany({
            where: { id: invoice.subscriptionId, tenantId: invoice.tenantId },
            data: { status: 'ACTIVE' },
          });
        }
        await tx.outboxEvent.create({
          data: {
            tenantId: invoice.tenantId,
            type: DOMAIN_EVENTS.INVOICE_PAID,
            payload: JSON.stringify({
              type: DOMAIN_EVENTS.INVOICE_PAID,
              payload: {
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                tenantId: invoice.tenantId,
                subscriptionId: invoice.subscriptionId ?? undefined,
                amountCents: invoice.amountCents,
              },
            }),
            status: 'PENDING',
          },
        });
      } else if (!deferInvoiceFailure) {
        await tx.outboxEvent.create({
          data: {
            tenantId: invoice.tenantId,
            type: DOMAIN_EVENTS.INVOICE_FAILED,
            payload: JSON.stringify({
              type: DOMAIN_EVENTS.INVOICE_FAILED,
              payload: {
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                tenantId: invoice.tenantId,
                subscriptionId: invoice.subscriptionId ?? undefined,
                reason: input.status,
              },
            }),
            status: 'PENDING',
          },
        });

        if (invoice.subscriptionId) {
          const subscription = await tx.subscription.findFirst({
            where: {
              id: invoice.subscriptionId,
              tenantId: invoice.tenantId,
              deletedAt: null,
            },
            include: { plan: true },
          });
          if (subscription) {
            await tx.subscription.updateMany({
              where: { id: subscription.id, tenantId: invoice.tenantId },
              data: { status: 'PAST_DUE' },
            });
            await tx.outboxEvent.create({
              data: {
                tenantId: invoice.tenantId,
                type: DOMAIN_EVENTS.SUBSCRIPTION_PAST_DUE,
                payload: JSON.stringify({
                  type: DOMAIN_EVENTS.SUBSCRIPTION_PAST_DUE,
                  payload: {
                    subscriptionId: subscription.id,
                    tenantId: invoice.tenantId,
                    dueAmountCents: invoice.amountCents,
                  },
                  occurredAt: new Date(),
                }),
                status: 'PENDING',
              },
            });
          }
        }
      }

      await tx.xenditWebhookReceipt.update({
        where: { idempotencyKey: input.idempotencyKey },
        data: { outcome: 'PROCESSED', processedAt: new Date() },
      });
      return 'PROCESSED';
    });
  }

  async processXenditRefundWebhookEvent(
    input: XenditRefundWebhookInput,
  ): Promise<'PROCESSED' | 'DUPLICATE' | 'IGNORED'> {
    return this.prisma.$transaction(async (tx) => {
      const receiptInsert = await tx.xenditWebhookReceipt.createMany({
        data: [
          {
            idempotencyKey: input.idempotencyKey,
            paymentId: input.refundId,
            referenceId: input.referenceId,
            eventType: input.eventType,
            paymentStatus: input.status,
          },
        ],
        skipDuplicates: true,
      });
      if (receiptInsert.count === 0) return 'DUPLICATE';

      const refund = await tx.invoiceRefund.findFirst({
        where: {
          OR: [
            { referenceId: input.referenceId },
            { providerRefundId: input.refundId },
          ],
        },
        include: { invoice: true },
      });
      if (!refund) {
        throw new NotFoundException(
          'Xendit refund does not match a persisted ERP refund request',
        );
      }
      requestContext.set({ tenantId: refund.tenantId });

      if (
        refund.referenceId !== input.referenceId ||
        refund.amountCents !== input.amount ||
        refund.currency.trim() !== input.currency
      ) {
        throw new BadRequestException(
          'Xendit refund identifiers or amount do not match the ERP refund request',
        );
      }
      if (
        refund.providerRefundId &&
        refund.providerRefundId !== input.refundId
      ) {
        throw new ConflictException(
          'Xendit refund ID does not match the persisted provider refund',
        );
      }

      const lockedInvoice = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Invoice"
        WHERE "id" = ${refund.invoiceId}
          AND "tenantId" = ${refund.tenantId}
          AND "deletedAt" IS NULL
          AND "status" IN ('PAID', 'PARTIALLY_REFUNDED')
        FOR UPDATE
      `;
      if (lockedInvoice.length !== 1) {
        throw new ConflictException('Invoice is not in a refundable status');
      }

      let nextStatus: 'SUCCEEDED' | 'FAILED';
      if (
        input.eventType === 'refund.succeeded' &&
        ['SUCCEEDED', 'COMPLETED'].includes(input.status)
      ) {
        nextStatus = 'SUCCEEDED';
      } else if (
        input.eventType === 'refund.failed' &&
        ['FAILED', 'REJECTED'].includes(input.status)
      ) {
        nextStatus = 'FAILED';
      } else {
        throw new BadRequestException(
          'Xendit refund event and status are not a supported pair',
        );
      }

      if (!['PENDING', 'UNKNOWN'].includes(refund.status)) {
        await tx.xenditWebhookReceipt.update({
          where: { idempotencyKey: input.idempotencyKey },
          data: { outcome: 'IGNORED', processedAt: new Date() },
        });
        return 'IGNORED';
      }

      const updatedRefund = await tx.invoiceRefund.updateMany({
        where: {
          id: refund.id,
          tenantId: refund.tenantId,
          status: { in: ['PENDING', 'UNKNOWN'] },
          OR: [
            { providerRefundId: input.refundId },
            { providerRefundId: null },
          ],
        },
        data: {
          status: nextStatus,
          providerRefundId: input.refundId,
          providerStatus: input.status,
          processedAt: new Date(),
        },
      });
      if (updatedRefund.count !== 1) {
        await tx.xenditWebhookReceipt.update({
          where: { idempotencyKey: input.idempotencyKey },
          data: { outcome: 'IGNORED', processedAt: new Date() },
        });
        return 'IGNORED';
      }

      if (nextStatus === 'SUCCEEDED') {
        const total = await tx.invoiceRefund.aggregate({
          where: {
            invoiceId: refund.invoiceId,
            tenantId: refund.tenantId,
            status: 'SUCCEEDED',
          },
          _sum: { amountCents: true },
        });
        const refundedAmountCents = total._sum.amountCents ?? 0;
        const invoiceStatus =
          refundedAmountCents === refund.invoice.amountCents
            ? 'REFUNDED'
            : 'PARTIALLY_REFUNDED';
        await tx.invoice.updateMany({
          where: {
            id: refund.invoiceId,
            tenantId: refund.tenantId,
            status: { in: ['PAID', 'PARTIALLY_REFUNDED'] },
          },
          data: { status: invoiceStatus, refundedAmountCents },
        });
        await tx.outboxEvent.create({
          data: {
            tenantId: refund.tenantId,
            type: DOMAIN_EVENTS.INVOICE_REFUNDED,
            payload: JSON.stringify({
              type: DOMAIN_EVENTS.INVOICE_REFUNDED,
              payload: {
                invoiceId: refund.invoiceId,
                refundId: refund.id,
                tenantId: refund.tenantId,
                amountCents: refund.amountCents,
                refundedAmountCents,
                status: invoiceStatus,
              },
            }),
            status: 'PENDING',
          },
        });
      }

      await tx.xenditWebhookReceipt.update({
        where: { idempotencyKey: input.idempotencyKey },
        data: { outcome: 'PROCESSED', processedAt: new Date() },
      });
      return 'PROCESSED';
    });
  }

  async findAllInvoices(tenantId: string, skip = 0, take = 10) {
    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.invoice.count({
        where: { tenantId, deletedAt: null },
      }),
    ]);

    return { data, total, skip, take };
  }

  async findInvoiceExportPage(
    where: Prisma.InvoiceWhereInput,
    cursor: InvoiceExportCursor | undefined,
    take: number,
    includeTenant = false,
  ): Promise<InvoiceExportRow[]> {
    const pageWhere: Prisma.InvoiceWhereInput = {
      AND: [
        where,
        ...(cursor
          ? [
              {
                OR: [
                  { createdAt: { gt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                ],
              },
            ]
          : []),
      ],
    };

    if (includeTenant) {
      const records = await this.prisma.invoice.findMany({
        where: pageWhere,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take,
        include: { tenant: { select: { name: true } } },
      });
      return records.map((record) => ({
        ...record,
        tenantName: record.tenant.name,
      }));
    }

    return this.prisma.invoice.findMany({
      where: pageWhere,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        amountCents: true,
        currency: true,
        dueAt: true,
        paidAt: true,
        createdAt: true,
      },
    });
  }

  async cancelPendingInvoice(id: string, tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.updateMany({
        where: {
          id,
          tenantId,
          deletedAt: null,
          status: 'PENDING',
          providerPaymentRequestId: null,
          providerPaymentId: null,
          OR: [
            { xenditPaymentRequestAttempt: { is: null } },
            {
              xenditPaymentRequestAttempt: {
                is: { state: 'REJECTED' },
              },
            },
          ],
        },
        data: { status: 'CANCELLED' },
      });
      if (updated.count !== 1) return null;

      const invoice = await tx.invoice.findFirst({
        where: { id, tenantId, deletedAt: null },
        select: { id: true, invoiceNumber: true },
      });
      if (!invoice) {
        throw new Error('Cancelled invoice could not be reloaded');
      }

      await tx.outboxEvent.create({
        data: {
          tenantId,
          type: DOMAIN_EVENTS.INVOICE_CANCELLED,
          payload: JSON.stringify({
            type: DOMAIN_EVENTS.INVOICE_CANCELLED,
            payload: {
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              tenantId,
            },
          }),
          status: 'PENDING',
        },
      });
      return invoice;
    });
  }

  async createInvoice(data: {
    tenantId: string;
    subscriptionId: string | null;
    amountCents: number;
    currency: string;
    status: string;
    dueAt: Date | null;
  }) {
    return this.prisma.$transaction((tx) => this.insertInvoice(tx, data));
  }

  async createInvoiceForBillingPeriod(
    data: {
      tenantId: string;
      subscriptionId: string;
      amountCents: number;
      currency: string;
      status: string;
      dueAt: Date;
      billingPeriodKey: string;
    },
    publishEvents: (
      tx: Prisma.TransactionClient,
      invoice: Invoice,
    ) => Promise<void>,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.invoice.findUnique({
          where: { billingPeriodKey: data.billingPeriodKey },
        });
        if (existing) return { invoice: existing, created: false };

        const invoice = await this.insertInvoice(tx, data);
        await publishEvents(tx, invoice);
        return { invoice, created: true };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.invoice.findUnique({
          where: { billingPeriodKey: data.billingPeriodKey },
        });
        if (existing) return { invoice: existing, created: false };
      }
      throw error;
    }
  }

  private async insertInvoice(
    tx: Prisma.TransactionClient,
    data: InvoiceCreateData,
  ) {
    const counters = await tx.$queryRaw<Array<{ value: number }>>`
      UPDATE "InvoiceNumberCounter"
      SET "value" = "value" + 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "key" = 'global'
      RETURNING "value"
    `;
    if (counters.length !== 1) {
      throw new Error('Global invoice number counter is not initialized');
    }

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const sequence = String(counters[0].value).padStart(6, '0');

    return tx.invoice.create({
      data: { ...data, invoiceNumber: `INV-${year}${month}-${sequence}` },
    });
  }

  async updateInvoiceStatus(
    id: string,
    tenantId: string,
    status: string,
    paidAt?: Date,
    expectedStatus?: string,
  ) {
    const updated = await this.prisma.invoice.updateMany({
      where: {
        id,
        tenantId,
        deletedAt: null,
        ...(expectedStatus ? { status: expectedStatus } : {}),
      },
      data: {
        status,
        ...(paidAt ? { paidAt } : {}),
      },
    });

    if (updated.count !== 1) return null;
    return this.findInvoiceById(id, tenantId);
  }

  async settlePaidInvoice(id: string, tenantId: string, paidAt: Date) {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id, tenantId, deletedAt: null, status: 'PENDING' },
      });
      if (!invoice) return null;

      const updated = await tx.invoice.updateMany({
        where: { id, tenantId, deletedAt: null, status: 'PENDING' },
        data: { status: 'PAID', paidAt },
      });
      if (updated.count !== 1) return null;

      if (invoice.subscriptionId) {
        await tx.subscription.updateMany({
          where: { id: invoice.subscriptionId, tenantId },
          data: { status: 'ACTIVE' },
        });
      }

      await tx.outboxEvent.create({
        data: {
          type: DOMAIN_EVENTS.INVOICE_PAID,
          payload: JSON.stringify({
            type: DOMAIN_EVENTS.INVOICE_PAID,
            payload: {
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              tenantId,
              subscriptionId: invoice.subscriptionId ?? undefined,
              amountCents: invoice.amountCents,
            },
          }),
          status: 'PENDING',
        },
      });

      return tx.invoice.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
    });
  }
}
