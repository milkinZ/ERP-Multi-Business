import { BadRequestException, Injectable } from '@nestjs/common';

import { SupplierRepository } from './supplier.repository';

@Injectable()
export class SupplierService {
  constructor(private readonly supplierRepository: SupplierRepository) {}

  create(
    tenantId: string,
    data: {
      name: string;
      phone?: string;
      email?: string;
      address?: string;
    },
  ) {
    return this.supplierRepository.create({
      tenantId,
      name: data.name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
    });
  }

  findAll(tenantId: string) {
    return this.supplierRepository.findAll(tenantId);
  }

  async findOne(id: string, tenantId: string) {
    const supplier = await this.supplierRepository.findOne(id, tenantId);

    if (!supplier) {
      throw new BadRequestException('Supplier not found');
    }

    return supplier;
  }

  async update(
    id: string,
    tenantId: string,
    data: {
      name?: string;
      phone?: string;
      email?: string;
      address?: string;
    },
  ) {
    const supplier = await this.supplierRepository.update(id, tenantId, {
      name: data.name,
      phone: data.phone ?? undefined,
      email: data.email ?? undefined,
      address: data.address ?? undefined,
    });

    if (!supplier) {
      throw new BadRequestException('Supplier not found');
    }

    return supplier;
  }

  async remove(id: string, tenantId: string) {
    const deleted = await this.supplierRepository.delete(id, tenantId);

    if (!deleted) {
      throw new BadRequestException('Supplier not found');
    }

    return {
      success: true,
    };
  }
}
