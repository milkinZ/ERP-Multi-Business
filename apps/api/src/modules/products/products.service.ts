import { BadRequestException, Injectable } from '@nestjs/common';
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
    price: number;
    tenantId: string;
  }) {
    try {
      return await this.productsRepository.createFromDto({
        tenantId: data.tenantId,
        name: data.name,
        description: data.description ?? null,
        sku: data.sku ?? null,
        price: data.price,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to create product';
      throw new BadRequestException(message);
    }
  }

  findAll(tenantId: string) {
    return this.productsRepository.findAll(tenantId);
  }

  findOne(id: string, tenantId: string) {
    return this.productsRepository.findOne(id, tenantId);
  }
}
