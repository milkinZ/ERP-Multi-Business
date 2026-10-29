import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { SupplierAggregate } from './domain/supplier.aggregate';
import { ListSuppliersQueryDto } from './dto/list-suppliers-query.dto';

@Injectable()
export class SupplierRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async findAll(tenantId: string, query: ListSuppliersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SupplierWhereInput = {
      tenantId,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              {
                name: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                email: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                phone: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                address: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.SupplierOrderByWithRelationInput =
      query.sortBy === 'name'
        ? { name: query.sortOrder ?? 'asc' }
        : { createdAt: query.sortOrder ?? 'desc' };
    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [orderBy, { id: 'desc' }],
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, tenantId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
    });

    if (!supplier) {
      return null;
    }

    return SupplierAggregate.create({
      id: supplier.id,
      tenantId: supplier.tenantId,
      name: supplier.name,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      isActive: supplier.isActive,
      createdAt: supplier.createdAt,
    });
  }

  async create(data: {
    tenantId: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  }) {
    const persisted = await this.prisma.supplier.create({
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email,
        address: data.address,
        tenantId: data.tenantId,
      },
    });

    return SupplierAggregate.create({
      id: persisted.id,
      tenantId: persisted.tenantId,
      name: persisted.name,
      phone: persisted.phone,
      email: persisted.email,
      address: persisted.address,
      isActive: persisted.isActive,
      createdAt: persisted.createdAt,
    });
  }

  async update(
    id: string,
    tenantId: string,
    data: {
      name?: string;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
      isActive?: boolean;
    },
  ) {
    const updated = await this.prisma.supplier.updateMany({
      where: { id, tenantId },
      data: {
        name: data.name,
        phone: data.phone === null ? null : (data.phone ?? undefined),
        email: data.email === null ? null : (data.email ?? undefined),
        address: data.address === null ? null : (data.address ?? undefined),
        isActive: data.isActive,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findOne(id, tenantId);
  }

  async delete(id: string, tenantId: string) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const supplier = await tx.supplier.findFirst({
            where: { id, tenantId },
            select: { id: true },
          });
          if (!supplier) return null;

          const purchaseOrder = await tx.purchaseOrder.findFirst({
            where: { supplierId: id, tenantId },
            select: { id: true },
          });
          if (purchaseOrder) {
            const deactivated = await tx.supplier.updateMany({
              where: { id, tenantId },
              data: { isActive: false },
            });
            return deactivated.count === 1 ? { id, deactivated: true } : null;
          }

          const deleted = await tx.supplier.deleteMany({
            where: { id, tenantId },
          });
          return deleted.count === 1 ? { id, deactivated: false } : null;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !['P2003', 'P2034'].includes(error.code)
      ) {
        throw error;
      }

      const hasPurchaseOrder = await this.prisma.purchaseOrder.findFirst({
        where: { supplierId: id, tenantId },
        select: { id: true },
      });
      if (!hasPurchaseOrder) throw error;

      const deactivated = await this.prisma.supplier.updateMany({
        where: { id, tenantId },
        data: { isActive: false },
      });
      return deactivated.count === 1 ? { id, deactivated: true } : null;
    }
  }
}
