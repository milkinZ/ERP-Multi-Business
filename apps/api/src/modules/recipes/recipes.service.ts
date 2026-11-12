import { Injectable } from '@nestjs/common';

import { RecipesRepository } from './recipes.repository';
import { RecipeAggregate } from './domain/recipe.aggregate';
import { ListRecipesQueryDto } from './dto/list-recipes-query.dto';

@Injectable()
export class RecipesService {
  constructor(private readonly recipesRepository: RecipesRepository) {}

  async create(
    tenantId: string,
    userId: string,
    dto: {
      productId: string;
      items: {
        inventoryItemId: string;
        quantity: number;
        unit?: string;
      }[];
    },
  ) {
    const aggregate = RecipeAggregate.create({
      id: `RC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tenantId,
      productId: dto.productId,
      items: dto.items,
      createdAt: new Date(),
    });

    return this.recipesRepository.createRecipe({
      tenantId,
      userId,
      productId: aggregate.productId,
      items: aggregate.items,
    });
  }

  findByProduct(productId: string, tenantId: string) {
    return this.recipesRepository.findByProduct(productId, tenantId);
  }

  update(
    tenantId: string,
    userId: string,
    productId: string,
    dto: {
      expectedRevision: number;
      items: { inventoryItemId: string; quantity: number; unit?: string }[];
    },
  ) {
    return this.recipesRepository.updateRecipe({
      tenantId,
      userId,
      productId,
      expectedRevision: dto.expectedRevision,
      items: dto.items,
    });
  }

  archive(productId: string, tenantId: string, userId: string) {
    return this.recipesRepository.archiveRecipe(productId, tenantId, userId);
  }

  restore(productId: string, tenantId: string, userId: string) {
    return this.recipesRepository.restoreRecipe(productId, tenantId, userId);
  }

  findAll(tenantId: string, query: ListRecipesQueryDto) {
    return this.recipesRepository.findAll(tenantId, query);
  }

  findByInventoryItem(
    inventoryItemId: string,
    tenantId: string,
    query: ListRecipesQueryDto,
  ) {
    return this.recipesRepository.findByInventoryItem(
      inventoryItemId,
      tenantId,
      query,
    );
  }
}
