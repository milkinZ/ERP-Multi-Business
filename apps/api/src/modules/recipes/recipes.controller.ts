import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { RecipesService } from './recipes.service';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { CurrentUser } from '../../common/decorator/current-user.decorator';
import { Permissions } from '../../common/decorator/permissions.decorator';

import type { JwtUser } from '../../common/interfaces/jwt-user.interface';

import { CreateRecipeDto } from './dto/create-recipe.dto';
import { ListRecipesQueryDto } from './dto/list-recipes-query.dto';
import { PermissionGuard } from '../rbac/permission.guard';
import { PERMISSIONS } from '../rbac/permissions';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('recipes')
export class RecipesController {
  constructor(private recipesService: RecipesService) {}

  @Post()
  @Permissions(PERMISSIONS.RECIPE_CREATE)
  create(
    @Body()
    dto: CreateRecipeDto,

    @CurrentUser()
    user: JwtUser,
  ) {
    return this.recipesService.create(user.tenantId, dto);
  }

  @Get()
  @Permissions(PERMISSIONS.RECIPE_READ)
  findAll(@Query() query: ListRecipesQueryDto, @CurrentUser() user: JwtUser) {
    return this.recipesService.findAll(user.tenantId, query);
  }

  @Get('by-inventory-item/:inventoryItemId')
  @Permissions(PERMISSIONS.RECIPE_READ)
  findByInventoryItem(
    @Param('inventoryItemId') inventoryItemId: string,
    @Query() query: ListRecipesQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.recipesService.findByInventoryItem(
      inventoryItemId,
      user.tenantId,
      query,
    );
  }

  @Get(':productId')
  @Permissions(PERMISSIONS.RECIPE_READ)
  findByProduct(
    @Param('productId')
    productId: string,

    @CurrentUser()
    user: JwtUser,
  ) {
    return this.recipesService.findByProduct(productId, user.tenantId);
  }
}
