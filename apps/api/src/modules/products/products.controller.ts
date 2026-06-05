import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CurrentUser } from '../../common/decorator/current-user.decorator';
import { PermissionGuard } from '../rbac/permission.guard';
import { Permissions } from '../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Post()
  @Permissions(PERMISSIONS.PRODUCT_CREATE)
  create(@Body() body: CreateProductDto, @Req() req: any) {
    return this.productsService.create({
      ...body,
      tenantId: req.user.tenantId,
    });
  }

  @Get()
  @Permissions(PERMISSIONS.PRODUCT_READ)
  findAll(@CurrentUser() user: any) {
    return this.productsService.findAll(user.tenantId);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PRODUCT_READ)
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.productsService.findOne(id, req.user.tenantId);
  }
}
