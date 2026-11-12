import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Headers,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { PurchaseOrderService } from './purchase-order.service';
import {
  CreatePurchaseOrderDto,
  ReceivePurchaseOrderDto,
  ReturnPurchaseOrderDto,
  UpdatePurchaseOrderDto,
  ListPriceVariancesQueryDto,
} from './dto';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { PurchaseOrderStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { Permissions } from '../../common/decorator/permissions.decorator';
import { CurrentUser } from '../../common/decorator/current-user.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import { ListPurchaseOrdersQueryDto } from './dto/list-purchase-orders-query.dto';
import { FeatureModuleGuard } from '../feature-flags/feature-module.guard';
import { RequireFeatureModule } from '../subscription/plans/feature-module.decorator';

@Controller('purchase-orders')
@UseGuards(JwtAuthGuard, PermissionGuard, FeatureModuleGuard)
@RequireFeatureModule('PROCUREMENT')
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
    @Query() query: ListPurchaseOrdersQueryDto,
  ) {
    return this.purchaseOrderService.findAll(user.tenantId, query);
  }

  @Get('price-variances')
  @Permissions(PERMISSIONS.PURCHASE_ORDER_READ)
  findPriceVariances(
    @CurrentUser() user: JwtUser,
    @Query() query: ListPriceVariancesQueryDto,
  ) {
    return this.purchaseOrderService.findPriceVariances(user.tenantId, query);
  }

  @Get(':id/returns')
  @Permissions(PERMISSIONS.PURCHASE_ORDER_READ)
  findReturns(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.purchaseOrderService.findReturns(
      user.tenantId,
      id,
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 10,
    );
  }

  @Get(':id/returnable-receipt-items')
  @Permissions(PERMISSIONS.PURCHASE_ORDER_READ)
  findReturnableReceiptItems(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.purchaseOrderService.findReturnableReceiptItems(
      user.tenantId,
      id,
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 10,
    );
  }

  @Post(':id/returns')
  @Permissions(PERMISSIONS.PURCHASE_ORDER_RECEIVE)
  returnItems(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ReturnPurchaseOrderDto,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return this.purchaseOrderService.returnPurchaseOrder(
      user.tenantId,
      id,
      user.userId,
      idempotencyKey,
      dto,
    );
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PURCHASE_ORDER_READ)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.purchaseOrderService.findOne(user.tenantId, id);
  }

  @Get(':id/receipts')
  @Permissions(PERMISSIONS.PURCHASE_ORDER_READ)
  findReceipts(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.purchaseOrderService.findReceipts(
      user.tenantId,
      id,
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 10,
    );
  }

  @Post(':id/receipts')
  @Permissions(PERMISSIONS.PURCHASE_ORDER_RECEIVE)
  receive(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ReceivePurchaseOrderDto,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return this.purchaseOrderService.receivePurchaseOrder(
      user.tenantId,
      id,
      user.userId,
      idempotencyKey,
      dto,
    );
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

  @Post(':id/cancel')
  @Permissions(PERMISSIONS.PURCHASE_ORDER_UPDATE)
  cancel(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.purchaseOrderService.cancel(user.tenantId, id);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.PURCHASE_ORDER_DELETE)
  delete(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.purchaseOrderService.delete(user.tenantId, id);
  }
}
