import { Injectable } from '@nestjs/common';

import { StockInDto } from './dto/stock-in.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { WasteDto } from './dto/waste.dto';

import { InventoryItemType } from '@prisma/client';
import { InventoryRepository } from './inventory.repository';

@Injectable()
export class InventoryService {
  constructor(private readonly inventoryRepository: InventoryRepository) {}

  async listInventoryItems(tenantId: string, type?: InventoryItemType) {
    return this.inventoryRepository.listInventoryItems(tenantId, type);
  }

  async stockIn(tenantId: string, dto: StockInDto, userId: string) {
    return this.inventoryRepository.stockIn(tenantId, dto, userId);
  }

  async adjustment(tenantId: string, dto: StockAdjustmentDto, userId: string) {
    return this.inventoryRepository.adjustment(tenantId, dto, userId);
  }

  async waste(tenantId: string, dto: WasteDto, userId: string) {
    return this.inventoryRepository.waste(tenantId, dto, userId);
  }

  async history(tenantId: string) {
    return this.inventoryRepository.history(tenantId);
  }

  async historyByItem(tenantId: string, inventoryItemId: string) {
    return this.inventoryRepository.historyByItem(tenantId, inventoryItemId);
  }
}
