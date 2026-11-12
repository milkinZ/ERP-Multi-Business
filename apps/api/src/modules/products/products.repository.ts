import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BusinessType, ProductStockMode } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';
import { ProductAggregate, ProductProps } from './domain/product.aggregate';
import { Money } from '../../core/domain/value-objects/money';

@Injectable()
export class ProductsRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async createProduct(props: ProductProps) {
    const persisted = await this.prisma.product.create({
      data: {
        id: props.id,
        name: props.name,
        description: props.description ?? undefined,
        sku: props.sku ?? undefined,
        price: props.price.toNumber(),
        tenantId: props.tenantId,
        stockMode: props.inventoryItemId
          ? ProductStockMode.INVENTORY_ITEM
          : ProductStockMode.UNTRACKED,
        inventoryItemId: props.inventoryItemId ?? undefined,
        isActive: props.isActive,
        outletId: props.outletId ?? undefined,
      },
    });

    return ProductAggregate.create({
      ...props,
      createdAt: persisted.createdAt,
    });
  }

  // Create product from DTO-style data including optional inventory item creation
  async createFromDto(data: {
    tenantId: string;
    name: string;
    description?: string | null;
    sku?: string | null;
    kitchenCategory?: string | null;
    kitchenPrepTimeMinutes?: number | null;
    price: number;
    stockMode?: ProductStockMode;
    inventoryUnit?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: data.tenantId },
        select: { businessType: true },
      });
      if (!tenant) throw new NotFoundException('Tenant not found');

      const defaultStockMode =
        tenant.businessType === BusinessType.RETAIL
          ? ProductStockMode.INVENTORY_ITEM
          : tenant.businessType === BusinessType.CAFE
            ? ProductStockMode.RECIPE
            : ProductStockMode.UNTRACKED;
      const stockMode = data.stockMode ?? defaultStockMode;

      if (
        stockMode === ProductStockMode.RECIPE &&
        tenant.businessType !== BusinessType.CAFE
      ) {
        throw new BadRequestException(
          'Recipe stock mode is only available for cafe tenants',
        );
      }
      if (
        stockMode === ProductStockMode.INVENTORY_ITEM &&
        data.inventoryUnit !== undefined &&
        !data.inventoryUnit.trim()
      ) {
        throw new BadRequestException('Inventory unit must not be empty');
      }

      if (data.sku) {
        const existing = await tx.product.findFirst({
          where: { tenantId: data.tenantId, sku: data.sku },
        });

        if (existing) {
          throw new ConflictException('SKU already exists');
        }
      }

      let inventoryItemId: string | undefined = undefined;

      if (stockMode === ProductStockMode.INVENTORY_ITEM) {
        const inventoryItem = await tx.inventoryItem.create({
          data: {
            code: data.sku ?? `PRD-${randomUUID()}`,
            name: data.name,
            description: data.description ?? undefined,
            type: 'PRODUCT',
            tenantId: data.tenantId,
            unit: data.inventoryUnit?.trim() || 'PCS',
          },
        });

        inventoryItemId = inventoryItem.id;
      }

      const product = await tx.product.create({
        data: {
          name: data.name,
          description: data.description ?? undefined,
          sku: data.sku ?? undefined,
          kitchenCategory:
            data.kitchenCategory?.trim().toLocaleLowerCase('en-US') ?? null,
          kitchenPrepTimeMinutes: data.kitchenPrepTimeMinutes ?? null,
          price: data.price,
          tenantId: data.tenantId,
          stockMode,
          inventoryItemId: inventoryItemId ?? undefined,
        },
        include: {
          InventoryItem: { select: { id: true, isActive: true, unit: true } },
          Recipe: {
            select: {
              id: true,
              isActive: true,
              revision: true,
              _count: { select: { RecipeItem: true } },
            },
          },
        },
      });

      return product;
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.product.findMany({
      where: this.buildTenantFilter(tenantId),
      include: {
        InventoryItem: { select: { id: true, isActive: true, unit: true } },
        Recipe: {
          select: {
            id: true,
            isActive: true,
            revision: true,
            _count: { select: { RecipeItem: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStockConfiguration(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { businessType: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return {
      businessType: tenant.businessType,
      defaultStockMode:
        tenant.businessType === BusinessType.RETAIL
          ? ProductStockMode.INVENTORY_ITEM
          : tenant.businessType === BusinessType.CAFE
            ? ProductStockMode.RECIPE
            : ProductStockMode.UNTRACKED,
    };
  }

  async findOne(id: string, tenantId: string) {
    const persisted = await this.prisma.product.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!persisted) {
      return null;
    }

    return ProductAggregate.create({
      id: persisted.id,
      tenantId: persisted.tenantId,
      name: persisted.name,
      description: persisted.description,
      sku: persisted.sku,
      price: Money.fromInteger(persisted.price),
      inventoryItemId: persisted.inventoryItemId,
      isActive: persisted.isActive,
      outletId: persisted.outletId,
      createdAt: persisted.createdAt,
    });
  }

  async updateProduct(
    id: string,
    tenantId: string,
    data: Partial<ProductProps>,
  ) {
    const persisted = await this.prisma.product.updateMany({
      where: { id, tenantId },
      data: {
        name: data.name,
        description:
          data.description === null ? null : (data.description ?? undefined),
        sku: data.sku === null ? null : (data.sku ?? undefined),
        price: data.price?.toNumber(),
        inventoryItemId:
          data.inventoryItemId === null
            ? null
            : (data.inventoryItemId ?? undefined),
        isActive: data.isActive,
        outletId: data.outletId === null ? null : (data.outletId ?? undefined),
      },
    });

    if (persisted.count !== 1) {
      return null;
    }

    return this.findOne(id, tenantId);
  }

  async updateKitchenSettings(
    id: string,
    tenantId: string,
    data: {
      kitchenCategory?: string | null;
      kitchenPrepTimeMinutes?: number | null;
    },
  ) {
    const updated = await this.prisma.product.updateMany({
      where: { id, tenantId },
      data: {
        ...(data.kitchenCategory !== undefined
          ? {
              kitchenCategory:
                data.kitchenCategory?.trim().toLocaleLowerCase('en-US') ?? null,
            }
          : {}),
        ...(data.kitchenPrepTimeMinutes !== undefined
          ? { kitchenPrepTimeMinutes: data.kitchenPrepTimeMinutes }
          : {}),
      },
    });

    if (updated.count !== 1) return null;
    return this.prisma.product.findFirst({ where: { id, tenantId } });
  }
}
