import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';

export type OutletProps = {
  id: string;
  tenantId: string;
  name: string;
  createdAt: Date;
};

export type OutletQueryOptions = {
  page: number;
  limit: number;
  search?: string;
  sortBy: 'name' | 'createdAt';
  sortOrder: 'asc' | 'desc';
  status: 'ACTIVE' | 'DELETED' | 'ALL';
};

@Injectable()
export class OutletsRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async findAll(tenantId: string, options: OutletQueryOptions) {
    const where = {
      ...this.buildTenantFilter(tenantId),
      ...(options.status === 'ALL'
        ? {}
        : { deletedAt: options.status === 'ACTIVE' ? null : { not: null } }),
      ...(options.search
        ? { name: { contains: options.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.outlet.findMany({
        where,
        skip: (options.page - 1) * options.limit,
        take: options.limit,
        select: {
          id: true,
          tenantId: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
        orderBy: [{ [options.sortBy]: options.sortOrder }, { id: 'asc' }],
      }),
      this.prisma.outlet.count({ where }),
    ]);
    return {
      data: data.map(({ deletedAt, ...outlet }) => ({
        ...outlet,
        isActive: deletedAt === null,
      })),
      total,
    };
  }

  async findOne(id: string, tenantId: string) {
    return this.prisma.outlet
      .findFirst({
        where: { id, tenantId, deletedAt: null },
        select: {
          id: true,
          tenantId: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
      })
      .then((outlet) => (outlet ? { ...outlet, isActive: true } : null));
  }

  async create(data: { tenantId: string; name: string }) {
    return this.prisma.outlet.create({
      data: {
        name: data.name,
        tenantId: data.tenantId,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async update(id: string, tenantId: string, data: { name?: string }) {
    return this.prisma.outlet.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        ...(data.name ? { name: data.name } : {}),
      },
    });
  }

  async softDelete(id: string, tenantId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const deletedAt = new Date();
      const result = await transaction.outlet.updateMany({
        where: { id, tenantId, deletedAt: null },
        data: { deletedAt },
      });
      if (result.count !== 1) return result;

      await transaction.userOutlet.updateMany({
        where: { outletId: id, tenantId, deletedAt: null },
        data: { deletedAt },
      });
      await transaction.session.updateMany({
        where: { outletId: id, tenantId, deletedAt: null },
        data: { outletId: null },
      });
      await transaction.refreshToken.updateMany({
        where: { outletId: id, tenantId, revokedAt: null },
        data: { outletId: null },
      });
      return result;
    });
  }
}
