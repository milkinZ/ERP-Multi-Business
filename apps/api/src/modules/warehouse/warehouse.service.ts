import { BadRequestException, Injectable } from '@nestjs/common';

import { WarehouseRepository } from './warehouse.repository';

@Injectable()
export class WarehouseService {
  constructor(private readonly warehouseRepository: WarehouseRepository) {}

  async create(tenantId: string, data: { name: string; outletId?: string }) {
    return this.warehouseRepository.create({
      id: `WH-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tenantId,
      name: data.name,
      code: `WH-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      outletId: data.outletId ?? null,
      createdAt: new Date(),
    });
  }

  findAll(tenantId: string) {
    return this.warehouseRepository.findAll(tenantId);
  }

  async findOne(id: string, tenantId: string) {
    const warehouse = await this.warehouseRepository.findOne(id, tenantId);

    if (!warehouse) {
      throw new BadRequestException('Warehouse not found');
    }

    return warehouse;
  }
}
