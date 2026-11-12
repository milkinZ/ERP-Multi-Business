import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
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
import { UpdateRecipeDto } from './dto/update-recipe.dto';
import { FeatureModuleGuard } from '../feature-flags/feature-module.guard';
import { RequireFeatureModule } from '../subscription/plans/feature-module.decorator';

@UseGuards(JwtAuthGuard, PermissionGuard, FeatureModuleGuard)
@Controller('recipes')
@RequireFeatureModule('INVENTORY')
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
    return this.recipesService.create(user.tenantId, user.userId, dto);
  }

  @Put(':productId')
  @Permissions(PERMISSIONS.RECIPE_UPDATE)
  update(
    @Param('productId') productId: string,
    @Body() dto: UpdateRecipeDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.recipesService.update(
      user.tenantId,
      user.userId,
      productId,
      dto,
    );
  }

  @Delete(':productId')
  @Permissions(PERMISSIONS.RECIPE_UPDATE)
  archive(@Param('productId') productId: string, @CurrentUser() user: JwtUser) {
    return this.recipesService.archive(productId, user.tenantId, user.userId);
  }

  @Post(':productId/restore')
  @Permissions(PERMISSIONS.RECIPE_UPDATE)
  restore(@Param('productId') productId: string, @CurrentUser() user: JwtUser) {
    return this.recipesService.restore(productId, user.tenantId, user.userId);
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
