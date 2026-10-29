import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import {
  WarehouseAggregate,
  WarehouseProps,
} from './domain/warehouse.aggregate';
import { WarehouseStocksQueryDto } from './dto/warehouse-stocks-query.dto';

@Injectable()
export class WarehouseRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async findAll(tenantId: string) {
    return this.prisma.warehouse.findMany({
      where: this.buildTenantFilter(tenantId),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, tenantId },
    });

    if (!warehouse) {
      return null;
    }

    return WarehouseAggregate.create({
      id: warehouse.id,
      tenantId: warehouse.tenantId,
      name: warehouse.name,
      code: warehouse.code,
      outletId: warehouse.outletId,
      isActive: warehouse.isActive,
      createdAt: warehouse.createdAt,
    });
  }

  async create(props: WarehouseProps) {
    return this.prisma.$transaction(
      async (tx) => {
        if (props.outletId) {
          await this.assertTenantOutletExists(
            props.tenantId,
            props.outletId,
            tx,
          );
        }

        const persisted = await tx.warehouse.create({
          data: {
            id: props.id,
            tenantId: props.tenantId,
            name: props.name,
            code: props.code,
            outletId: props.outletId ?? undefined,
            isActive: props.isActive,
          },
        });

        return WarehouseAggregate.create({
          ...props,
          createdAt: persisted.createdAt,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async update(id: string, tenantId: string, data: Partial<WarehouseProps>) {
    return this.prisma.$transaction(
      async (tx) => {
        if (data.outletId) {
          await this.assertTenantOutletExists(tenantId, data.outletId, tx);
        }

        const result = await tx.warehouse.updateMany({
          where: { id, tenantId },
          data: {
            name: data.name,
            outletId:
              data.outletId === null ? null : (data.outletId ?? undefined),
            isActive: data.isActive,
          },
        });

        if (result.count !== 1) {
          return null;
        }

        const warehouse = await tx.warehouse.findFirst({
          where: { id, tenantId },
        });
        if (!warehouse) {
          return null;
        }

        return WarehouseAggregate.create({
          id: warehouse.id,
          tenantId: warehouse.tenantId,
          name: warehouse.name,
          code: warehouse.code,
          outletId: warehouse.outletId,
          isActive: warehouse.isActive,
          createdAt: warehouse.createdAt,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async remove(id: string, tenantId: string) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const warehouse = await tx.warehouse.findFirst({
            where: { id, tenantId },
            select: { id: true },
          });
          if (!warehouse) {
            return null;
          }

          const [movements, stocks, purchaseOrders, outgoing, incoming] =
            await Promise.all([
              tx.inventoryMovement.count({ where: { warehouseId: id } }),
              tx.inventoryStock.count({ where: { warehouseId: id } }),
              tx.purchaseOrder.count({ where: { warehouseId: id } }),
              tx.warehouseTransfer.count({
                where: { sourceWarehouseId: id },
              }),
              tx.warehouseTransfer.count({
                where: { destinationWarehouseId: id },
              }),
            ]);

          if (movements + stocks + purchaseOrders + outgoing + incoming > 0) {
            await tx.warehouse.updateMany({
              where: { id, tenantId },
              data: { isActive: false },
            });
            return { id, deleted: false, deactivated: true };
          }

          await tx.warehouse.delete({ where: { id } });
          return { id, deleted: true, deactivated: false };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        const result = await this.prisma.warehouse.updateMany({
          where: { id, tenantId },
          data: { isActive: false },
        });
        return result.count === 1
          ? { id, deleted: false, deactivated: true }
          : null;
      }
      throw error;
    }
  }

  async listStocks(
    warehouseId: string,
    tenantId: string,
    query: WarehouseStocksQueryDto,
  ) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId },
      select: { id: true },
    });
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = {
      warehouseId,
      InventoryItem: {
        tenantId,
        ...(query.search
          ? {
              OR: [
                {
                  name: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  code: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      },
    };

    const [stocks, total] = await Promise.all([
      this.prisma.inventoryStock.findMany({
        where,
        select: {
          inventoryItemId: true,
          quantity: true,
          updatedAt: true,
          InventoryItem: {
            select: {
              id: true,
              code: true,
              name: true,
              type: true,
              unit: true,
            },
          },
        },
        orderBy: [
          { InventoryItem: { name: 'asc' } },
          { inventoryItemId: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventoryStock.count({ where }),
    ]);

    return {
      data: stocks.map((stock) => ({
        inventoryItemId: stock.inventoryItemId,
        code: stock.InventoryItem.code,
        name: stock.InventoryItem.name,
        type: stock.InventoryItem.type,
        unit: stock.InventoryItem.unit,
        quantity: stock.quantity,
        updatedAt: stock.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async assertTenantOutletExists(
    tenantId: string,
    outletId: string,
    client: Prisma.TransactionClient,
  ) {
    const outlet = await client.outlet.findFirst({
      where: { id: outletId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!outlet) {
      throw new NotFoundException('Outlet not found');
    }
  }
}
