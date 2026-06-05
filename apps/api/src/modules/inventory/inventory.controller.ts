import { Body, Controller, Post, UseGuards, Get, Param } from '@nestjs/common';
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

@Controller('inventory')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

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
  ) {
    return this.inventoryService.history(user.tenantId);
  }

  @Get('history/:inventoryItemId')
  @Permissions(PERMISSIONS.INVENTORY_READ)
  historyByItem(
    @Param('inventoryItemId')
    inventoryItemId: string,

    @CurrentUser()
    user: JwtUser,
  ) {
    return this.inventoryService.historyByItem(user.tenantId, inventoryItemId);
  }
}
