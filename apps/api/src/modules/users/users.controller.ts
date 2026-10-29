import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorator/current-user.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../../common/decorator/permissions.decorator';
import { PermissionGuard } from '../rbac/permission.guard';
import { PERMISSIONS } from '../rbac/permissions';
import { UserResponseDto } from './dto/user-response.dto';
import { UserListResponseDto } from './dto/user-list-response.dto';
import { UsersQueryDto } from './dto/users-query.dto';
import { CreateUserInvitationDto } from './dto/create-user-invitation.dto';
import { UserStatusDto } from './dto/user-status.dto';
import { UsersService } from './users.service';
import { UsersInvitationsService } from './users-invitations.service';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly invitations: UsersInvitationsService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.USER_READ)
  @ApiOkResponse({ type: UserListResponseDto })
  getAll(
    @CurrentUser() user: JwtUser,
    @Query() query: UsersQueryDto,
  ): Promise<UserListResponseDto> {
    return this.usersService.getAll(user.tenantId, query);
  }

  @Get('invitations')
  @Permissions(PERMISSIONS.USER_READ)
  getInvitations(@CurrentUser() user: JwtUser, @Query() query: UsersQueryDto) {
    return this.invitations.findPending(user.tenantId, query.page, query.limit);
  }

  @Post('invitations')
  @Permissions(PERMISSIONS.USER_ROLE_MANAGE)
  createInvitation(
    @Body() dto: CreateUserInvitationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.invitations.create(user.tenantId, user.userId, dto);
  }

  @Delete('invitations/:id')
  @Permissions(PERMISSIONS.USER_ROLE_MANAGE)
  revokeInvitation(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.invitations.revoke(user.tenantId, id);
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

  @Patch(':id/status')
  @Permissions(PERMISSIONS.USER_ROLE_MANAGE)
  setStatus(
    @Param('id') id: string,
    @Body() dto: UserStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.usersService.setStatus(
      user.tenantId,
      user.userId,
      id,
      dto.isActive,
    );
  }
}
