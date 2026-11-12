import { BadRequestException, Injectable } from '@nestjs/common';

import { SupplierRepository } from './supplier.repository';
import { ListSuppliersQueryDto } from './dto/list-suppliers-query.dto';
import { ListSupplierItemOffersQueryDto } from './dto/list-supplier-item-offers-query.dto';
import { CreateSupplierItemOfferDto } from './dto/create-supplier-item-offer.dto';

function normalizeOptionalString(value?: string): string | null | undefined {
  if (value === undefined) return undefined;
  return value.trim() || null;
}

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
      contactPerson?: string;
      taxNumber?: string;
    },
  ) {
    return this.supplierRepository.create({
      tenantId,
      name: data.name,
      phone: normalizeOptionalString(data.phone) ?? null,
      email: normalizeOptionalString(data.email) ?? null,
      address: normalizeOptionalString(data.address) ?? null,
      contactPerson: normalizeOptionalString(data.contactPerson) ?? null,
      taxNumber: normalizeOptionalString(data.taxNumber) ?? null,
    });
  }

  findAll(tenantId: string, query: ListSuppliersQueryDto) {
    return this.supplierRepository.findAll(tenantId, query);
  }

  async findOffers(
    supplierId: string,
    tenantId: string,
    query: ListSupplierItemOffersQueryDto,
  ) {
    await this.findOne(supplierId, tenantId);
    return this.supplierRepository.findOffers(supplierId, tenantId, {
      ...query,
      asOf: query.asOf ? new Date(query.asOf) : undefined,
    });
  }

  async createOffer(
    supplierId: string,
    tenantId: string,
    dto: CreateSupplierItemOfferDto,
  ) {
    const offer = await this.supplierRepository.createOffer(
      supplierId,
      tenantId,
      {
        ...dto,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
      },
    );
    if (!offer) throw new BadRequestException('Supplier not found');
    return offer;
  }

  async closeOffer(
    supplierId: string,
    offerId: string,
    tenantId: string,
    effectiveTo: string,
  ) {
    const offer = await this.supplierRepository.closeOffer(
      supplierId,
      offerId,
      tenantId,
      new Date(effectiveTo),
    );
    if (!offer) throw new BadRequestException('Supplier offer not found');
    return offer;
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
      contactPerson?: string;
      taxNumber?: string;
      isActive?: boolean;
    },
  ) {
    const supplier = await this.supplierRepository.update(id, tenantId, {
      name: data.name,
      phone: normalizeOptionalString(data.phone),
      email: normalizeOptionalString(data.email),
      address: normalizeOptionalString(data.address),
      contactPerson: normalizeOptionalString(data.contactPerson),
      taxNumber: normalizeOptionalString(data.taxNumber),
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
