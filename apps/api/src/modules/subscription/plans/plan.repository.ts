import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../../core/database/repositories/base.repository';
import { PrismaService } from '../../../core/database/prisma.service';

@Injectable()
export class PlanRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async findAll() {
    return this.prisma.plan.findMany({
      where: { deletedAt: null },
      orderBy: { priceCents: 'asc' },
    });
  }

  async findById(id: string) {
    return this.prisma.plan.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async findByType(type: string) {
    return this.prisma.plan.findFirst({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      where: { type: type as any, deletedAt: null },
    });
  }

  async create(data: { type: string; name: string; priceCents: number }) {
    return this.prisma.plan.create({
      data: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        type: data.type as any,
        name: data.name,
        priceCents: data.priceCents,
      },
    });
  }

  async update(id: string, data: { name?: string; priceCents?: number }) {
    return this.prisma.plan.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string) {
    return this.prisma.plan.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
