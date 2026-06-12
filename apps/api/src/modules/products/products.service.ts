import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { InventoryItemType } from '@prisma/client';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    name: string;
    description?: string;
    sku?: string;
    price: number;
    tenantId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: data.tenantId },
        select: { businessType: true },
      });

      if (data.sku) {
        const existing = await tx.product.findFirst({
          where: {
            tenantId: data.tenantId,
            sku: data.sku,
          },
        });

        if (existing) {
          throw new BadRequestException('SKU already exists');
        }
      }

      // Business rules:
      // - CAFE: Product is a finished menu item; inventoryItem is created from ingredients/recipe, not from product.
      // - RETAIL: Product is sellable inventory item; inventoryItem is created from product.
      let inventoryItemId: string | null = null;

      if (tenant?.businessType === 'RETAIL') {
        const inventoryItem = await tx.inventoryItem.create({
          data: {
            code:
              data.sku ??
              `PRD-${new Date().getTime()}-${Math.floor(Math.random() * 1000)}`,
            name: data.name,
            description: data.description,
            type: InventoryItemType.PRODUCT,
            tenantId: data.tenantId,
          },
        });

        inventoryItemId = inventoryItem.id;
      }

      const product = await tx.product.create({
        data: {
          name: data.name,
          description: data.description,
          sku: data.sku,
          price: data.price,
          tenantId: data.tenantId,
          inventoryItemId: inventoryItemId ?? undefined,
        },
        include: {
          inventoryItem: true,
        },
      });

      return product;
    });
  }

  findAll(tenantId: string) {
    return this.prisma.product.findMany({
      where: {
        tenantId,
      },
      include: {
        inventoryItem: {
          include: {
            stocks: {
              include: {
                warehouse: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  findOne(id: string, tenantId: string) {
    return this.prisma.product.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        inventoryItem: {
          include: {
            stocks: {
              include: {
                warehouse: true,
              },
            },
          },
        },
      },
    });
  }
}
