import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Patch,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { Permissions } from '../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';

import { OrdersService } from './orders.service';

import { CreateOrderDto } from './dto/create-order.dto';

import { CurrentUser } from '../../common/decorator/current-user.decorator';

import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('salesOrders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post()
  @Permissions(PERMISSIONS.ORDER_CREATE)
  create(
    @Body() body: CreateOrderDto,

    @CurrentUser()
    user: JwtUser,
  ) {
    return this.ordersService.create(
      user.tenantId,
      user.outletId || null,
      body.items,
      body.orderMode,
    );
  }

  @Get()
  @Permissions(PERMISSIONS.ORDER_READ)
  findAll(
    @CurrentUser()
    user: JwtUser,
  ) {
    return this.ordersService.findAll(user);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.ORDER_READ)
  findOne(
    @Param('id') id: string,

    @CurrentUser()
    user: JwtUser,
  ) {
    return this.ordersService.findOne(id, user);
  }

  @Patch(':id/status')
  @Permissions(PERMISSIONS.ORDER_UPDATE)
  updateStatus(
    @Param('id') id: string,

    @Body()
    body: UpdateOrderStatusDto,

    @CurrentUser()
    user: JwtUser,
  ) {
    return this.ordersService.updateStatus(id, user, body.status);
  }
}
