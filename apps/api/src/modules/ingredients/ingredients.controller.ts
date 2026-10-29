import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { IngredientsService } from './ingredients.service';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { CurrentUser } from '../../common/decorator/current-user.decorator';
import { Permissions } from '../../common/decorator/permissions.decorator';

import type { JwtUser } from '../../common/interfaces/jwt-user.interface';

import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { ListIngredientsQueryDto } from './dto/list-ingredients-query.dto';
import { PermissionGuard } from '../rbac/permission.guard';
import { PERMISSIONS } from '../rbac/permissions';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('ingredients')
export class IngredientsController {
  constructor(private ingredientsService: IngredientsService) {}

  @Post()
  @Permissions(PERMISSIONS.INGREDIENT_CREATE)
  create(
    @Body()
    dto: CreateIngredientDto,

    @CurrentUser()
    user: JwtUser,
  ) {
    return this.ingredientsService.create(user.tenantId, dto);
  }

  @Get()
  @Permissions(PERMISSIONS.INGREDIENT_READ)
  findAll(
    @Query()
    query: ListIngredientsQueryDto,

    @CurrentUser()
    user: JwtUser,
  ) {
    return this.ingredientsService.findAll(user.tenantId, query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.INGREDIENT_READ)
  findOne(
    @Param('id')
    id: string,

    @CurrentUser()
    user: JwtUser,
  ) {
    return this.ingredientsService.findOne(id, user.tenantId);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.INGREDIENT_UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateIngredientDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.ingredientsService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.INGREDIENT_DELETE)
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.ingredientsService.remove(id, user.tenantId);
  }
}
