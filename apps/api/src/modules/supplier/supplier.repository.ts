import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { SupplierAggregate } from './domain/supplier.aggregate';

@Injectable()
export class SupplierRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async findAll(tenantId: string) {
    return this.prisma.supplier.findMany({
      where: {
        tenantId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
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
    },
  ) {
    const updated = await this.prisma.supplier.updateMany({
      where: { id, tenantId },
      data: {
        name: data.name,
        phone: data.phone === null ? null : (data.phone ?? undefined),
        email: data.email === null ? null : (data.email ?? undefined),
        address: data.address === null ? null : (data.address ?? undefined),
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findOne(id, tenantId);
  }

  async delete(id: string, tenantId: string) {
    const result = await this.prisma.supplier.deleteMany({
      where: { id, tenantId },
    });

    return result.count === 1;
  }
}
