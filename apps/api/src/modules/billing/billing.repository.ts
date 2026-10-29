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
      if (providerMatches.length === 0) {
        throw new NotFoundException(
          'Xendit payment ID is not pre-correlated to an ERP invoice',
        );
      }
      const invoices = matches.filter(
        (invoice): invoice is NonNullable<typeof invoice> => invoice !== null,
      );
      const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
      if (invoiceIds.size > 1) {
        throw new ConflictException(
          'Xendit identifiers resolve to different ERP invoices',
        );
      }

      const invoice = invoices[0];
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
      if (
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

      const updated = await tx.invoice.updateMany({
        where: {
          id: invoice.id,
          tenantId: invoice.tenantId,
          deletedAt: null,
          status: 'PENDING',
        },
        data: {
          status: transition,
          ...(transition === 'PAID' ? { paidAt: new Date() } : {}),
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
      } else {
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
