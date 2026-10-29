import {
  Body,
  Controller,
  Post,
  UseGuards,
  Get,
  Param,
  Query,
  Headers,
  BadRequestException,
  Put,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InventoryService } from './inventory.service';
import { CurrentUser } from '../../common/decorator/current-user.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { StockInDto } from './dto/stock-in.dto';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';
import { PermissionGuard } from '../rbac/permission.guard';
import { PERMISSIONS } from '../rbac/permissions';
import { Permissions } from '../../common/decorator/permissions.decorator';
import { WasteDto } from './dto/waste.dto';
import { InventoryItemListQueryDto } from './dto/inventory-item-list.dto';
import { WarehouseTransferService } from './warehouse-transfer.service';
import { CreateWarehouseTransferDto } from './dto/create-warehouse-transfer.dto';
import { ReceiveWarehouseTransferDto } from './dto/receive-warehouse-transfer.dto';
import { InventoryHistoryListQueryDto } from './dto/inventory-history-list.dto';
import { ConfigureInventoryValuationDto } from './dto/configure-inventory-valuation.dto';
import { InventoryReorderRulesDto } from './dto/inventory-reorder-rules.dto';

const parsePaginationParameter = (
  name: string,
  value: string | undefined,
  defaultValue: number,
  maximum?: number,
  minimum = 0,
) => {
  if (value === undefined) {
    return defaultValue;
  }
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new BadRequestException(`${name} must be a non-negative integer`);
  }

  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    (maximum !== undefined && parsed > maximum)
  ) {
    throw new BadRequestException(
      maximum === undefined
        ? `${name} must be a safe integer greater than or equal to ${minimum}`
        : `${name} must be between ${minimum} and ${maximum}`,
    );
  }
  return parsed;
};

@Controller('inventory')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class InventoryController {
  constructor(
    private inventoryService: InventoryService,
    private readonly warehouseTransferService: WarehouseTransferService,
  ) {}

  @Post('stock-in')
  @Permissions(PERMISSIONS.INVENTORY_ADJUST)
  stockIn(@Body() dto: StockInDto, @CurrentUser() user: JwtUser) {
    return this.inventoryService.stockIn(user.tenantId, dto, user.userId);
  }

  @Post('adjustment')
  @Permissions(PERMISSIONS.INVENTORY_ADJUST)
  adjustment(
    @Body() dto: StockAdjustmentDto,
    @CurrentUser()
    user: JwtUser,
  ) {
    return this.inventoryService.adjustment(user.tenantId, dto, user.userId);
  }

  @Post('waste')
  @Permissions(PERMISSIONS.INVENTORY_ADJUST)
  waste(
    @Body() dto: WasteDto,
    @CurrentUser()
    user: JwtUser,
  ) {
    return this.inventoryService.waste(user.tenantId, dto, user.userId);
  }

  @Get('history')
  @Permissions(PERMISSIONS.INVENTORY_READ)
  history(
    @CurrentUser()
    user: JwtUser,
    @Query() query: InventoryHistoryListQueryDto,
  ) {
    return this.inventoryService.history(user.tenantId, query);
  }

  @Get('items')
  @Permissions(PERMISSIONS.INVENTORY_READ)
  items(
    @CurrentUser() user: JwtUser,
    @Query() query: InventoryItemListQueryDto,
  ) {
    return this.inventoryService.listInventoryItems(user.tenantId, query);
  }

  @Get('history/:inventoryItemId')
  @Permissions(PERMISSIONS.INVENTORY_READ)
  historyByItem(
    @Param('inventoryItemId')
    inventoryItemId: string,

    @CurrentUser()
    user: JwtUser,
    @Query() query: InventoryHistoryListQueryDto,
  ) {
    return this.inventoryService.historyByItem(
      user.tenantId,
      inventoryItemId,
      query,
    );
  }

  @Get('items/:inventoryItemId/stocks')
  @Permissions(PERMISSIONS.INVENTORY_READ)
  stockBalances(
    @Param('inventoryItemId') inventoryItemId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.inventoryService.stockBalances(user.tenantId, inventoryItemId);
  }

  @Get('items/:inventoryItemId/availability')
  @Permissions(PERMISSIONS.INVENTORY_READ)
  availability(
    @Param('inventoryItemId') inventoryItemId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.inventoryService.availability(user.tenantId, inventoryItemId);
  }

  @Get('items/:inventoryItemId/reorder-rules')
  @Permissions(PERMISSIONS.INVENTORY_READ)
  reorderRules(
    @Param('inventoryItemId') inventoryItemId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.inventoryService.getReorderRules(
      user.tenantId,
      inventoryItemId,
    );
  }

  @Put('items/:inventoryItemId/reorder-rules')
  @Permissions(PERMISSIONS.INVENTORY_ADJUST)
  replaceReorderRules(
    @Param('inventoryItemId') inventoryItemId: string,
    @Body() dto: InventoryReorderRulesDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.inventoryService.replaceReorderRules(
      user.tenantId,
      inventoryItemId,
      dto,
    );
  }

  @Get('items/:inventoryItemId/valuation')
  @Permissions(PERMISSIONS.INVENTORY_READ)
  valuation(
    @Param('inventoryItemId') inventoryItemId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.inventoryService.getValuation(user.tenantId, inventoryItemId);
  }

  @Post('items/:inventoryItemId/valuation')
  @Permissions(PERMISSIONS.INVENTORY_ADJUST)
  configureValuation(
    @Param('inventoryItemId') inventoryItemId: string,
    @Body() dto: ConfigureInventoryValuationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.inventoryService.configureValuation(
      user.tenantId,
      inventoryItemId,
      dto,
    );
  }

  @Get('items/:inventoryItemId')
  @Permissions(PERMISSIONS.INVENTORY_READ)
  getInventoryItem(
    @Param('inventoryItemId') inventoryItemId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.inventoryService.findInventoryItem(
      user.tenantId,
      inventoryItemId,
    );
  }

  @Post('transfers')
  @Permissions(PERMISSIONS.INVENTORY_ADJUST)
  createTransfer(
    @Body() dto: CreateWarehouseTransferDto,
    @CurrentUser() user: JwtUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return this.warehouseTransferService.create(
      user.tenantId,
      user.userId,
      idempotencyKey,
      dto,
    );
  }

  @Get('transfers')
  @Permissions(PERMISSIONS.INVENTORY_READ)
  listTransfers(
    @CurrentUser() user: JwtUser,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.warehouseTransferService.findAll(
      user.tenantId,
      parsePaginationParameter('skip', skip, 0),
      parsePaginationParameter('take', take, 20, 100, 1),
    );
  }

  @Get('transfers/:id')
  @Permissions(PERMISSIONS.INVENTORY_READ)
  getTransfer(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.warehouseTransferService.findOne(user.tenantId, id);
  }

  @Post('transfers/:id/ship')
  @Permissions(PERMISSIONS.INVENTORY_ADJUST)
  shipTransfer(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.warehouseTransferService.ship(user.tenantId, id, user.userId);
  }

  @Post('transfers/:id/receipts')
  @Permissions(PERMISSIONS.INVENTORY_ADJUST)
  receiveTransfer(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ReceiveWarehouseTransferDto,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return this.warehouseTransferService.receive(
      user.tenantId,
      id,
      user.userId,
      idempotencyKey,
      dto,
    );
  }

  @Post('transfers/:id/cancel')
  @Permissions(PERMISSIONS.INVENTORY_ADJUST)
  cancelTransfer(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.warehouseTransferService.cancel(user.tenantId, id);
  }
}
