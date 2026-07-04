import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import {
  WarehouseAggregate,
  WarehouseProps,
} from './domain/warehouse.aggregate';

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
      createdAt: warehouse.createdAt,
    });
  }

  async create(props: WarehouseProps) {
    const persisted = await this.prisma.warehouse.create({
      data: {
        id: props.id,
        tenantId: props.tenantId,
        name: props.name,
        code: props.code,
        outletId: props.outletId ?? undefined,
      },
    });

    return WarehouseAggregate.create({
      ...props,
      createdAt: persisted.createdAt,
    });
  }

  async update(id: string, tenantId: string, data: Partial<WarehouseProps>) {
    const result = await this.prisma.warehouse.updateMany({
      where: { id, tenantId },
      data: {
        name: data.name,
        code: data.code,
        outletId: data.outletId === null ? null : (data.outletId ?? undefined),
      },
    });

    if (result.count !== 1) {
      return null;
    }

    return this.findOne(id, tenantId);
  }
}
