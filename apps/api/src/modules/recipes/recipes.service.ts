import { Injectable } from '@nestjs/common';

import { RecipesRepository } from './recipes.repository';
import { RecipeAggregate } from './domain/recipe.aggregate';
import { ListRecipesQueryDto } from './dto/list-recipes-query.dto';

@Injectable()
export class RecipesService {
  constructor(private readonly recipesRepository: RecipesRepository) {}

  async create(
    tenantId: string,
    dto: {
      productId: string;
      items: {
        inventoryItemId: string;
        quantity: number;
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
      productId: aggregate.productId,
      items: aggregate.items,
    });
  }

  findByProduct(productId: string, tenantId: string) {
    return this.recipesRepository.findByProduct(productId, tenantId);
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
