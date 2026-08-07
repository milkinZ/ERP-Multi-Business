import { BadRequestException, Injectable } from '@nestjs/common';

import { BusinessType } from '@prisma/client';

import { InventoryRepository } from '../inventory/inventory.repository';

@Injectable()
export class FulfillmentService {
  constructor(private readonly inventoryRepository: InventoryRepository) {}

  async processOrder(orderId: string, tenantId: string): Promise<boolean> {
    const businessType =
      await this.inventoryRepository.resolveTenantBusinessType(tenantId);

    switch (businessType) {
      case BusinessType.RETAIL:
        return this.inventoryRepository.fulfillRetail(orderId, tenantId);

      case BusinessType.CAFE:
        return this.inventoryRepository.fulfillCafe(orderId, tenantId);

      default:
        throw new BadRequestException(
          `Unsupported business type: ${businessType}`,
        );
    }
  }
}
