import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { KitchenService } from './kitchen.service';
import { UpdateKitchenStatusDto } from './dto/update-kitchen.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorator/current-user.decorator';
import { Permissions } from '../../common/decorator/permissions.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { PermissionGuard } from '../rbac/permission.guard';
import { PERMISSIONS } from '../rbac/permissions';
import { SetKitchenPriorityDto } from './dto/update-kitchen.dto';
import { UpdateKitchenSettingsDto } from './dto/update-kitchen-settings.dto';
import { ListKitchenTicketsDto } from './dto/list-kitchen-tickets.dto';

@UseGuards(JwtAuthGuard, PermissionGuard)
@UsePipes(new ValidationPipe({ transform: true }))
@Controller('kitchen')
export class KitchenController {
  constructor(private kitchenService: KitchenService) {}

  @Get('orders')
  @Permissions(PERMISSIONS.KITCHEN_READ)
  getQueue(
    @Query() query: ListKitchenTicketsDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.getQueue(
      user.tenantId,
      user.outletId || null,
      query,
    );
  }

  @Get('orders/:id')
  @Permissions(PERMISSIONS.KITCHEN_READ)
  getTicket(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.kitchenService.getTicket(
      id,
      user.tenantId,
      user.outletId || null,
    );
  }

  @Get('settings')
  @Permissions(PERMISSIONS.KITCHEN_READ)
  getSettings(@CurrentUser() user: JwtUser) {
    return this.kitchenService.getSettings(user.tenantId);
  }

  @Patch('settings')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  updateSettings(
    @Body() dto: UpdateKitchenSettingsDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.updateWaitThreshold(
      user.tenantId,
      dto.waitThresholdMinutes,
      user.userId,
    );
  }

  @Patch('orders/:id/priority')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  setPriority(
    @Param('id') id: string,
    @Body() dto: SetKitchenPriorityDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.setPriority(
      id,
      user.tenantId,
      dto.priority,
      user.userId,
      user.outletId || null,
    );
  }

  @Patch('orders/:id/start')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  startCooking(
    @Param('id') id: string,
    @Body() _dto: UpdateKitchenStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.startCooking(
      id,
      user.tenantId,
      user.outletId || null,
    );
  }

  @Patch('orders/:id/ready')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  markReady(
    @Param('id') id: string,
    @Body() _dto: UpdateKitchenStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.markReady(
      id,
      user.tenantId,
      user.outletId || null,
    );
  }

  @Patch('orders/:id/serve')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  markServed(
    @Param('id') id: string,
    @Body() _dto: UpdateKitchenStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.markServed(
      id,
      user.tenantId,
      user.outletId || null,
    );
  }

  @Patch('orders/:id/cancel')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  cancel(
    @Param('id') id: string,
    @Body() _dto: UpdateKitchenStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.cancel(id, user.tenantId, user.outletId || null);
  }

  @Patch('orders/:id/recall')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  recall(
    @Param('id') id: string,
    @Body() _dto: UpdateKitchenStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.recall(id, user.tenantId, user.outletId || null);
  }
}
