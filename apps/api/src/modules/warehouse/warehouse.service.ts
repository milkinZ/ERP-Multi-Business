import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { WarehouseRepository } from './warehouse.repository';
import { WarehouseStocksQueryDto } from './dto/warehouse-stocks-query.dto';

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
      isActive: true,
      createdAt: new Date(),
    });
  }

  findAll(tenantId: string) {
    return this.warehouseRepository.findAll(tenantId);
  }

  async findOne(id: string, tenantId: string) {
    const warehouse = await this.warehouseRepository.findOne(id, tenantId);

    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    return warehouse;
  }

  async update(
    id: string,
    tenantId: string,
    data: { name?: string; outletId?: string | null; isActive?: boolean },
  ) {
    if (
      data.name === undefined &&
      data.outletId === undefined &&
      data.isActive === undefined
    ) {
      throw new BadRequestException('At least one warehouse field is required');
    }
    const warehouse = await this.warehouseRepository.update(id, tenantId, data);
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }
    return warehouse;
  }

  async remove(id: string, tenantId: string) {
    const result = await this.warehouseRepository.remove(id, tenantId);
    if (!result) {
      throw new NotFoundException('Warehouse not found');
    }
    return result;
  }

  listStocks(
    warehouseId: string,
    tenantId: string,
    query: WarehouseStocksQueryDto,
  ) {
    return this.warehouseRepository.listStocks(warehouseId, tenantId, query);
  }
}
