import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { Permissions } from '../../common/decorator/permissions.decorator';
import { CurrentUser } from '../../common/decorator/current-user.decorator';

import { WarehouseService } from './warehouse.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseStocksQueryDto } from './dto/warehouse-stocks-query.dto';
import { PermissionGuard } from '../rbac/permission.guard';
import { PERMISSIONS } from '../rbac/permissions';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';

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
    user: JwtUser,
  ) {
    return this.warehouseService.create(user.tenantId, dto);
  }

  @Get()
  @Permissions(PERMISSIONS.WAREHOUSE_READ)
  findAll(
    @CurrentUser()
    user: JwtUser,
  ) {
    return this.warehouseService.findAll(user.tenantId);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.WAREHOUSE_READ)
  findOne(
    @Param('id') id: string,

    @CurrentUser()
    user: JwtUser,
  ) {
    return this.warehouseService.findOne(id, user.tenantId);
  }

  @Get(':id/stocks')
  @Permissions(PERMISSIONS.WAREHOUSE_READ)
  listStocks(
    @Param('id') id: string,
    @Query() query: WarehouseStocksQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.warehouseService.listStocks(id, user.tenantId, query);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.WAREHOUSE_UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.warehouseService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.WAREHOUSE_DELETE)
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.warehouseService.remove(id, user.tenantId);
  }
}
