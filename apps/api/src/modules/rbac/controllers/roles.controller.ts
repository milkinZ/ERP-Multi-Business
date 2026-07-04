import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionGuard } from '../permission.guard';
import { Permissions } from '../../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../permissions';
import { CurrentUser } from '../../../common/decorator/current-user.decorator';
import type { JwtUser } from '../../../common/interfaces/jwt-user.interface';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { RolesService } from '../services/roles.service';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions(PERMISSIONS.ROLE_READ)
  getAll(@CurrentUser() user: JwtUser) {
    return this.rolesService.getAll(user.tenantId);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.ROLE_READ)
  getById(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.rolesService.getById(user.tenantId, id);
  }

  @Post()
  @Permissions(PERMISSIONS.ROLE_CREATE)
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: JwtUser) {
    return this.rolesService.create(user.tenantId, dto);
  }

  @Put(':id')
  @Permissions(PERMISSIONS.ROLE_UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.rolesService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.ROLE_DELETE)
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.rolesService.remove(user.tenantId, id);
  }
}
