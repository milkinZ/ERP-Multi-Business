import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CurrentUser } from '../../common/decorator/current-user.decorator';
import { PermissionGuard } from '../rbac/permission.guard';
import { Permissions } from '../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Post()
  @Permissions(PERMISSIONS.PRODUCT_CREATE)
  create(
    @Body()
    body: CreateProductDto,

    @CurrentUser()
    user: JwtUser,
  ) {
    return this.productsService.create({
      ...body,
      tenantId: user.tenantId,
    });
  }

  @Get()
  @Permissions(PERMISSIONS.PRODUCT_READ)
  findAll(
    @CurrentUser()
    user: JwtUser,
  ) {
    return this.productsService.findAll(user.tenantId);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PRODUCT_READ)
  findOne(
    @Param('id')
    id: string,
    @CurrentUser()
    user: JwtUser,
  ) {
    return this.productsService.findOne(id, user.tenantId);
  }
}
