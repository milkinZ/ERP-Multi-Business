import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProductStockMode } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { ProductsRepository } from './products.repository';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private readonly productsRepository: ProductsRepository,
  ) {}

  async create(data: {
    name: string;
    description?: string;
    sku?: string;
    kitchenCategory?: string;
    kitchenPrepTimeMinutes?: number;
    price: number;
    tenantId: string;
    stockMode?: ProductStockMode;
    inventoryUnit?: string;
  }) {
    if (data.kitchenCategory !== undefined && !data.kitchenCategory.trim()) {
      throw new BadRequestException('Kitchen category must not be empty');
    }

    return this.productsRepository.createFromDto({
      tenantId: data.tenantId,
      name: data.name,
      description: data.description ?? null,
      sku: data.sku ?? null,
      kitchenCategory: data.kitchenCategory ?? null,
      kitchenPrepTimeMinutes: data.kitchenPrepTimeMinutes ?? null,
      price: data.price,
      stockMode: data.stockMode,
      inventoryUnit: data.inventoryUnit,
    });
  }

  findAll(tenantId: string) {
    return this.productsRepository.findAll(tenantId);
  }

  getStockConfiguration(tenantId: string) {
    return this.productsRepository.getStockConfiguration(tenantId);
  }

  findOne(id: string, tenantId: string) {
    return this.productsRepository.findOne(id, tenantId);
  }

  async updateKitchenSettings(
    id: string,
    tenantId: string,
    data: {
      kitchenCategory?: string | null;
      kitchenPrepTimeMinutes?: number | null;
    },
  ) {
    if (
      data.kitchenCategory === undefined &&
      data.kitchenPrepTimeMinutes === undefined
    ) {
      throw new BadRequestException('At least one Kitchen setting is required');
    }

    if (data.kitchenCategory !== undefined && data.kitchenCategory !== null) {
      if (!data.kitchenCategory.trim()) {
        throw new BadRequestException('Kitchen category must not be empty');
      }
    }

    const updated = await this.productsRepository.updateKitchenSettings(
      id,
      tenantId,
      data,
    );
    if (!updated) throw new NotFoundException('Product not found');
    return updated;
  }
}
