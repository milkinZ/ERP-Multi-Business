import { Injectable } from '@nestjs/common';
import { BusinessType } from '@prisma/client';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';

export type TenantProps = {
  id: string;
  name: string;
  businessType?: BusinessType | null;
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

  async create(data: { name: string; businessType?: BusinessType | null }) {
    return this.prisma.tenant.create({
      data: {
        name: data.name,
        businessType: data.businessType ?? undefined,
      },
    });
  }

  async update(
    id: string,
    data: { name?: string; businessType?: BusinessType | null },
  ) {
    return this.prisma.tenant.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        businessType: data.businessType ?? undefined,
      },
    });
  }

  async softDelete(id: string) {
    return this.prisma.tenant.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
