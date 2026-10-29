import { BadRequestException, Injectable } from '@nestjs/common';

import { SupplierRepository } from './supplier.repository';
import { ListSuppliersQueryDto } from './dto/list-suppliers-query.dto';

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

  findAll(tenantId: string, query: ListSuppliersQueryDto) {
    return this.supplierRepository.findAll(tenantId, query);
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
      isActive?: boolean;
    },
  ) {
    const supplier = await this.supplierRepository.update(id, tenantId, {
      name: data.name,
      phone: data.phone ?? undefined,
      email: data.email ?? undefined,
      address: data.address ?? undefined,
      isActive: data.isActive,
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

    return { success: true, deactivated: deleted.deactivated };
  }
}
