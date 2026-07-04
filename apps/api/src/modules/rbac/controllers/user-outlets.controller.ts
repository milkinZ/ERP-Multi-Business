import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionGuard } from '../permission.guard';
import { Permissions } from '../../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../permissions';
import { CurrentUser } from '../../../common/decorator/current-user.decorator';
import type { JwtUser } from '../../../common/interfaces/jwt-user.interface';
import { UserOutletsDto } from '../dto/user-outlets.dto';
import { UserOutletsService } from '../services/user-outlets.service';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UserOutletsController {
  constructor(private readonly userOutletsService: UserOutletsService) {}

  @Get(':id/outlets')
  @Permissions(PERMISSIONS.USER_OUTLET_MANAGE)
  getUserOutlets(@Param('id') userId: string, @CurrentUser() user: JwtUser) {
    return this.userOutletsService.getUserOutlets(user.tenantId, userId);
  }

  @Put(':id/outlets')
  @Permissions(PERMISSIONS.USER_OUTLET_MANAGE)
  putUserOutlets(
    @Param('id') userId: string,
    @Body() dto: UserOutletsDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.userOutletsService.setUserOutlets(
      user.tenantId,
      userId,
      dto.outletIds,
    );
  }
}
