import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';

import { KitchenService } from './kitchen.service';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { CurrentUser } from '../../common/decorator/current-user.decorator';
import { Permissions } from '../../common/decorator/permissions.decorator';

import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { PermissionGuard } from '../rbac/permission.guard';
import { PERMISSIONS } from '../rbac/permissions';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('kitchen')
export class KitchenController {
  constructor(private kitchenService: KitchenService) {}

  @Get('orders')
  @Permissions(PERMISSIONS.KITCHEN_READ)
  getQueue(
    @CurrentUser()
    user: JwtUser,
  ) {
    return this.kitchenService.getQueue(user.tenantId);
  }

  @Patch('orders/:id/start')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  startCooking(
    @Param('id')
    id: string,

    @CurrentUser()
    user: JwtUser,
  ) {
    return this.kitchenService.startCooking(id, user.tenantId);
  }

  @Patch('orders/:id/ready')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  ready(
    @Param('id')
    id: string,

    @CurrentUser()
    user: JwtUser,
  ) {
    return this.kitchenService.ready(id, user.tenantId);
  }

  @Patch('orders/:id/complete')
  @Permissions(PERMISSIONS.KITCHEN_UPDATE)
  complete(
    @Param('id')
    id: string,

    @CurrentUser()
    user: JwtUser,
  ) {
    return this.kitchenService.complete(id, user.tenantId);
  }
}
