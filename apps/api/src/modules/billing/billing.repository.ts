import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { DOMAIN_EVENTS } from '../../core/events/domain-events';

export type InvoiceRecord = Prisma.InvoiceGetPayload<{
  include: { tenant: true };
}>;

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

  async createInvoice(data: {
    tenantId: string;
    subscriptionId: string | null;
    invoiceNumber: string;
    amountCents: number;
    currency: string;
    status: string;
    dueAt: Date | null;
  }) {
    return this.prisma.invoice.create({ data });
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
    return this.prisma.$transaction(
      async (tx) => {
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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async generateInvoiceNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.invoice.count({
      where: { tenantId },
    });

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const sequence = String(count + 1).padStart(6, '0');

    return `INV-${year}${month}-${sequence}`;
  }
}
