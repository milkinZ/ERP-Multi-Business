import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
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
              {
                contactPerson: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                taxNumber: {
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
      contactPerson: supplier.contactPerson,
      taxNumber: supplier.taxNumber,
      isActive: supplier.isActive,
      createdAt: supplier.createdAt,
    });
  }

  async findOffers(
    supplierId: string,
    tenantId: string,
    query: {
      inventoryItemId?: string;
      asOf?: Date;
      skip: number;
      take: number;
    },
  ) {
    const where: Prisma.SupplierItemOfferWhereInput = {
      supplierId,
      tenantId,
      ...(query.inventoryItemId
        ? { inventoryItemId: query.inventoryItemId }
        : {}),
      ...(query.asOf
        ? {
            AND: [
              { effectiveFrom: { lte: query.asOf } },
              {
                OR: [
                  { effectiveTo: null },
                  { effectiveTo: { gt: query.asOf } },
                ],
              },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.supplierItemOffer.findMany({
        where,
        include: {
          InventoryItem: {
            select: { id: true, code: true, name: true, unit: true },
          },
        },
        skip: query.skip,
        take: query.take,
        orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.supplierItemOffer.count({ where }),
    ]);

    return {
      data,
      pagination: {
        skip: query.skip,
        take: query.take,
        total,
        hasMore: query.skip + data.length < total,
      },
    };
  }

  async createOffer(
    supplierId: string,
    tenantId: string,
    input: {
      inventoryItemId: string;
      unit: string;
      supplierSku?: string;
      unitPrice: number;
      minimumOrderQuantity?: number;
      leadTimeDays?: number;
      effectiveFrom: Date;
      effectiveTo?: Date;
    },
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const suppliers = await tx.$queryRaw<
          Array<{ id: string; isActive: boolean }>
        >`
            SELECT "id", "isActive"
            FROM "Supplier"
            WHERE "id" = ${supplierId} AND "tenantId" = ${tenantId}
            FOR UPDATE
          `;
        if (!suppliers[0]) return null;
        if (!suppliers[0].isActive) {
          throw new BadRequestException(
            'Inactive suppliers cannot receive new offers',
          );
        }

        const items = await tx.$queryRaw<
          Array<{ id: string; unit: string | null }>
        >`
            SELECT "id", "unit"
            FROM "InventoryItem"
            WHERE "id" = ${input.inventoryItemId} AND "tenantId" = ${tenantId}
            FOR UPDATE
          `;
        const item = items[0];
        if (!item) {
          throw new BadRequestException('Inventory item not found');
        }
        if (!item.unit || input.unit !== item.unit) {
          throw new BadRequestException(
            'Supplier offer unit must match the inventory item base unit',
          );
        }

        const tenants = await tx.$queryRaw<
          Array<{ currencyCode: string | null }>
        >`
            SELECT "currencyCode"
            FROM "Tenant"
            WHERE "id" = ${tenantId} AND "deletedAt" IS NULL
            FOR SHARE
          `;
        const currencyCode = tenants[0]?.currencyCode?.trim();
        if (!currencyCode) {
          throw new BadRequestException(
            'Configure the tenant base currency before adding supplier offers',
          );
        }
        if (
          input.effectiveTo &&
          input.effectiveTo.getTime() <= input.effectiveFrom.getTime()
        ) {
          throw new BadRequestException(
            'Offer end date must be later than its start date',
          );
        }

        const overlap = await tx.supplierItemOffer.findFirst({
          where: {
            tenantId,
            supplierId,
            inventoryItemId: input.inventoryItemId,
            effectiveFrom: input.effectiveTo
              ? { lt: input.effectiveTo }
              : undefined,
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gt: input.effectiveFrom } },
            ],
          },
          select: { id: true },
        });
        if (overlap) {
          throw new ConflictException(
            'Supplier offers for the same item cannot have overlapping effective dates',
          );
        }

        return tx.supplierItemOffer.create({
          data: {
            tenantId,
            supplierId,
            inventoryItemId: input.inventoryItemId,
            supplierSku: input.supplierSku?.trim() || null,
            unit: input.unit,
            unitPrice: new Prisma.Decimal(input.unitPrice),
            currencyCode,
            minimumOrderQuantity:
              input.minimumOrderQuantity === undefined
                ? null
                : new Prisma.Decimal(input.minimumOrderQuantity),
            leadTimeDays: input.leadTimeDays ?? null,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: input.effectiveTo ?? null,
          },
          include: {
            InventoryItem: {
              select: { id: true, code: true, name: true, unit: true },
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async closeOffer(
    supplierId: string,
    offerId: string,
    tenantId: string,
    effectiveTo: Date,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const offer = await tx.supplierItemOffer.findFirst({
          where: { id: offerId, supplierId, tenantId },
          select: { id: true, inventoryItemId: true, effectiveFrom: true },
        });
        if (!offer) return null;

        await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "InventoryItem"
            WHERE "id" = ${offer.inventoryItemId} AND "tenantId" = ${tenantId}
            FOR UPDATE
          `;
        if (effectiveTo.getTime() <= offer.effectiveFrom.getTime()) {
          throw new BadRequestException(
            'Offer end date must be later than its start date',
          );
        }
        const nextOffer = await tx.supplierItemOffer.findFirst({
          where: {
            supplierId,
            tenantId,
            inventoryItemId: offer.inventoryItemId,
            id: { not: offer.id },
            effectiveFrom: { lt: effectiveTo },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gt: offer.effectiveFrom } },
            ],
          },
          select: { id: true },
        });
        if (nextOffer) {
          throw new ConflictException(
            'Closing this offer would overlap another effective offer',
          );
        }
        return tx.supplierItemOffer.update({
          where: { id: offer.id },
          data: { effectiveTo },
          include: {
            InventoryItem: {
              select: { id: true, code: true, name: true, unit: true },
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async create(data: {
    tenantId: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    contactPerson?: string | null;
    taxNumber?: string | null;
  }) {
    const persisted = await this.prisma.supplier.create({
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email,
        address: data.address,
        contactPerson: data.contactPerson,
        taxNumber: data.taxNumber,
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
      contactPerson: persisted.contactPerson,
      taxNumber: persisted.taxNumber,
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
      contactPerson?: string | null;
      taxNumber?: string | null;
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
        contactPerson:
          data.contactPerson === null
            ? null
            : (data.contactPerson ?? undefined),
        taxNumber:
          data.taxNumber === null ? null : (data.taxNumber ?? undefined),
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
          const offer = await tx.supplierItemOffer.findFirst({
            where: { supplierId: id, tenantId },
            select: { id: true },
          });
          if (purchaseOrder || offer) {
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
      const hasOffer = await this.prisma.supplierItemOffer.findFirst({
        where: { supplierId: id, tenantId },
        select: { id: true },
      });
      if (!hasPurchaseOrder && !hasOffer) throw error;

      const deactivated = await this.prisma.supplier.updateMany({
        where: { id, tenantId },
        data: { isActive: false },
      });
      return deactivated.count === 1 ? { id, deactivated: true } : null;
    }
  }
}
