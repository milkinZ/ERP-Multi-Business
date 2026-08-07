import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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

@UseGuards(JwtAuthGuard, PermissionGuard)
@UsePipes(new ValidationPipe({ transform: true }))
@Controller('kitchen')
export class KitchenController {
  constructor(private kitchenService: KitchenService) {}

  @Get('orders')
  @Permissions(PERMISSIONS.KITCHEN_READ)
  getQueue(@CurrentUser() user: JwtUser) {
    return this.kitchenService.getQueue(user.tenantId);
  }

  @Patch('orders/:id/start')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  startCooking(
    @Param('id') id: string,
    @Body() _dto: UpdateKitchenStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.startCooking(id, user.tenantId);
  }

  @Patch('orders/:id/ready')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  markReady(
    @Param('id') id: string,
    @Body() _dto: UpdateKitchenStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.markReady(id, user.tenantId);
  }

  @Patch('orders/:id/serve')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  markServed(
    @Param('id') id: string,
    @Body() _dto: UpdateKitchenStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.markServed(id, user.tenantId);
  }

  @Patch('orders/:id/cancel')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  cancel(
    @Param('id') id: string,
    @Body() _dto: UpdateKitchenStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.cancel(id, user.tenantId);
  }

  @Patch('orders/:id/recall')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  recall(
    @Param('id') id: string,
    @Body() _dto: UpdateKitchenStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.kitchenService.recall(id, user.tenantId);
  }
}
