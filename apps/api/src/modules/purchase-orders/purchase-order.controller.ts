import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { PurchaseOrderService } from './purchase-order.service';
import { CreatePurchaseOrderDto, UpdatePurchaseOrderDto } from './dto';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { PurchaseOrderStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { Permissions } from '../../common/decorator/permissions.decorator';
import { CurrentUser } from '../../common/decorator/current-user.decorator';
import { PERMISSIONS } from '../rbac/permissions';

@Controller('purchase-orders')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PurchaseOrderController {
  constructor(private readonly purchaseOrderService: PurchaseOrderService) {}

  @Post()
  @Permissions(PERMISSIONS.PURCHASE_ORDER_CREATE)
  create(
    @Body() createPurchaseOrderDto: CreatePurchaseOrderDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.purchaseOrderService.create(
      user.tenantId,
      user.userId,
      createPurchaseOrderDto,
    );
  }

  @Get()
  @Permissions(PERMISSIONS.PURCHASE_ORDER_READ)
  findAll(
    @CurrentUser() user: JwtUser,
    @Query('status') status?: PurchaseOrderStatus,
    @Query('supplierId') supplierId?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.purchaseOrderService.findAll(user.tenantId, {
      status,
      supplierId,
      skip: skip ? parseInt(skip) : 0,
      take: take ? parseInt(take) : 10,
    });
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PURCHASE_ORDER_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.purchaseOrderService.findOne(user.tenantId, id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.PURCHASE_ORDER_UPDATE)
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() updatePurchaseOrderDto: UpdatePurchaseOrderDto,
  ) {
    return this.purchaseOrderService.update(
      user.tenantId,
      id,
      user.userId,
      updatePurchaseOrderDto,
    );
  }

  @Patch(':id/status')
  @Permissions(
    PERMISSIONS.PURCHASE_ORDER_APPROVE,
    PERMISSIONS.PURCHASE_ORDER_RECEIVE,
  )
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body('status') status: PurchaseOrderStatus,
  ) {
    if (!status) {
      throw new BadRequestException('Status is required');
    }
    return this.purchaseOrderService.updateStatus(user.tenantId, id, status);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.PURCHASE_ORDER_DELETE)
  delete(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.purchaseOrderService.delete(user.tenantId, id, user.userId);
  }
}
