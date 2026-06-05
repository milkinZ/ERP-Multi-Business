import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { Permissions } from '../../common/decorator/permissions.decorator';
import { CurrentUser } from '../../common/decorator/current-user.decorator';

import { WarehouseService } from './warehouse.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { PermissionGuard } from '../rbac/permission.guard';
import { PERMISSIONS } from '../rbac/permissions';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('warehouses')
export class WarehouseController {
  constructor(private warehouseService: WarehouseService) {}

  @Post()
  @Permissions(PERMISSIONS.WAREHOUSE_CREATE)
  create(
    @Body()
    dto: CreateWarehouseDto,

    @CurrentUser()
    user: any,
  ) {
    return this.warehouseService.create(user.tenantId, dto);
  }

  @Get()
  @Permissions(PERMISSIONS.WAREHOUSE_READ)
  findAll(
    @CurrentUser()
    user: any,
  ) {
    return this.warehouseService.findAll(user.tenantId);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.WAREHOUSE_READ)
  findOne(
    @Param('id') id: string,

    @CurrentUser()
    user: any,
  ) {
    return this.warehouseService.findOne(id, user.tenantId);
  }
}
