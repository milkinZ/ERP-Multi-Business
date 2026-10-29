import { Injectable } from '@nestjs/common';

import { StockInDto } from './dto/stock-in.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { WasteDto } from './dto/waste.dto';

import { InventoryRepository } from './inventory.repository';
import { InventoryHistoryListQueryDto } from './dto/inventory-history-list.dto';
import { InventoryItemListQueryDto } from './dto/inventory-item-list.dto';
import { ConfigureInventoryValuationDto } from './dto/configure-inventory-valuation.dto';
import { InventoryReorderRulesDto } from './dto/inventory-reorder-rules.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly inventoryRepository: InventoryRepository) {}

  async listInventoryItems(tenantId: string, query: InventoryItemListQueryDto) {
    return this.inventoryRepository.listInventoryItems(tenantId, query);
  }

  async findInventoryItem(tenantId: string, inventoryItemId: string) {
    return this.inventoryRepository.findInventoryItem(
      tenantId,
      inventoryItemId,
    );
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

  async history(tenantId: string, query: InventoryHistoryListQueryDto) {
    return this.inventoryRepository.history(tenantId, query);
  }

  async historyByItem(
    tenantId: string,
    inventoryItemId: string,
    query: InventoryHistoryListQueryDto,
  ) {
    return this.inventoryRepository.historyByItem(
      tenantId,
      inventoryItemId,
      query,
    );
  }

  async stockBalances(tenantId: string, inventoryItemId: string) {
    return this.inventoryRepository.stockBalances(tenantId, inventoryItemId);
  }

  async availability(tenantId: string, inventoryItemId: string) {
    return this.inventoryRepository.availability(tenantId, inventoryItemId);
  }

  async getReorderRules(tenantId: string, inventoryItemId: string) {
    return this.inventoryRepository.getReorderRules(tenantId, inventoryItemId);
  }

  async replaceReorderRules(
    tenantId: string,
    inventoryItemId: string,
    dto: InventoryReorderRulesDto,
  ) {
    return this.inventoryRepository.replaceReorderRules(
      tenantId,
      inventoryItemId,
      dto,
    );
  }

  async getValuation(tenantId: string, inventoryItemId: string) {
    return this.inventoryRepository.getValuation(tenantId, inventoryItemId);
  }

  async configureValuation(
    tenantId: string,
    inventoryItemId: string,
    dto: ConfigureInventoryValuationDto,
  ) {
    return this.inventoryRepository.configureValuation(
      tenantId,
      inventoryItemId,
      dto,
    );
  }
}
