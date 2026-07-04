import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';

export type OutletProps = {
  id: string;
  tenantId: string;
  name: string;
  createdAt: Date;
};

@Injectable()
export class OutletsRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async findAll(tenantId: string) {
    return this.prisma.outlet.findMany({
      where: this.buildTenantFilter(tenantId),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    return this.prisma.outlet.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  async create(data: { tenantId: string; name: string }) {
    return this.prisma.outlet.create({
      data: {
        name: data.name,
        tenantId: data.tenantId,
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
    return this.prisma.outlet.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
}
