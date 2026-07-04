import { Injectable } from '@nestjs/common';
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
    price: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: data.tenantId },
        select: { businessType: true },
      });

      if (data.sku) {
        const existing = await tx.product.findFirst({
          where: { tenantId: data.tenantId, sku: data.sku },
        });

        if (existing) {
          throw new Error('SKU already exists');
        }
      }

      let inventoryItemId: string | undefined = undefined;

      if (tenant?.businessType === 'RETAIL') {
        const inventoryItem = await tx.inventoryItem.create({
          data: {
            code:
              data.sku ??
              `PRD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            name: data.name,
            description: data.description ?? undefined,
            type: 'PRODUCT',
            tenantId: data.tenantId,
          },
        });

        inventoryItemId = inventoryItem.id;
      }

      const product = await tx.product.create({
        data: {
          name: data.name,
          description: data.description ?? undefined,
          sku: data.sku ?? undefined,
          price: data.price,
          tenantId: data.tenantId,
          inventoryItemId: inventoryItemId ?? undefined,
        },
        include: { InventoryItem: true },
      });

      return product;
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.product.findMany({
      where: this.buildTenantFilter(tenantId),
      orderBy: { createdAt: 'desc' },
    });
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
}
