import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../core/database/prisma.service'
import { InventoryItemType } from '@prisma/client'

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) { }

  async create(data: {
    name: string
    description?: string
    sku?: string
    price: number
    tenantId: string
  }) {
    return this.prisma.$transaction(async (tx) => {
      const inventoryItem = await tx.inventoryItem.create({
        data: {
          code: data.sku ?? `PRD-${new Date().getTime()}-${Math.floor(Math.random() * 1000)}`,
          name: data.name,
          description: data.description,
          type: InventoryItemType.PRODUCT,
          tenantId: data.tenantId,
        },
      })

      if (data.sku) {
        const existing =
          await tx.product.findFirst({
            where: {
              tenantId: data.tenantId,
              sku: data.sku,
            },
          })

        if (existing) {
          throw new BadRequestException(
            'SKU already exists',
          )
        }
      }

      const product = await tx.product.create({
        data: {
          name: data.name,
          description: data.description,
          sku: data.sku,
          price: data.price,
          tenantId: data.tenantId,
          inventoryItemId: inventoryItem.id,
        },
        include: {
          inventoryItem: true,
        },
      })

      return product
    })
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
    })
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
    })
  }
}