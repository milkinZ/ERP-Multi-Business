import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorator/current-user.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../../common/decorator/permissions.decorator';
import { PermissionGuard } from '../rbac/permission.guard';
import { PERMISSIONS } from '../rbac/permissions';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions(PERMISSIONS.USER_READ)
  @ApiOkResponse({ type: [UserResponseDto] })
  getAll(@CurrentUser() user: JwtUser): Promise<UserResponseDto[]> {
    return this.usersService.getAll(user.tenantId);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.USER_READ)
  @ApiOkResponse({ type: UserResponseDto })
  getById(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<UserResponseDto> {
    return this.usersService.getById(user.tenantId, id);
  }
}
