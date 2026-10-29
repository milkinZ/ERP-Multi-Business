import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BusinessType, TenantStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';

export type TenantProps = {
  id: string;
  name: string;
  businessType?: BusinessType | null;
  status: TenantStatus;
  createdAt: Date;
  deletedAt?: Date | null;
};

@Injectable()
export class TenantsRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async findAll(tenantId: string) {
    return this.prisma.tenant.findMany({
      where: { id: tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      businessType?: BusinessType | null;
      currencyCode?: string;
    },
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const lockedTenant = await tx.$queryRaw<
          Array<{ id: string; currencyCode: string | null }>
        >`
          SELECT "id", "currencyCode"
          FROM "Tenant"
          WHERE "id" = ${id} AND "deletedAt" IS NULL
          FOR UPDATE
        `;
        const tenant = lockedTenant[0];
        if (!tenant) {
          throw new NotFoundException('Tenant not found');
        }

        if (
          data.currencyCode !== undefined &&
          tenant.currencyCode !== null &&
          data.currencyCode !== tenant.currencyCode
        ) {
          const [orders, purchaseOrders, payments] = await Promise.all([
            tx.salesOrder.count({ where: { tenantId: id } }),
            tx.purchaseOrder.count({ where: { tenantId: id } }),
            tx.payment.count({ where: { tenantId: id } }),
          ]);
          if (orders + purchaseOrders + payments > 0) {
            throw new ConflictException(
              'Base currency cannot be changed after the first financial transaction',
            );
          }
        }

        return tx.tenant.update({
          where: { id },
          data: {
            ...(data.name ? { name: data.name } : {}),
            businessType: data.businessType ?? undefined,
            currencyCode: data.currencyCode,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
