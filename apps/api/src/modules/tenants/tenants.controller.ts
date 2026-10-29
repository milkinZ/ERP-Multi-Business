import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { Permissions } from '../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';

import { TenantsService } from './tenants.service';

import { UpdateTenantDto } from './dto/update-tenant.dto';

@Controller('tenants')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TenantsController {
  constructor(private tenantsService: TenantsService) {}

  @Get()
  @Permissions(PERMISSIONS.BUSINESS_READ)
  getAll() {
    return this.tenantsService.findAll();
  }

  @Get(':id')
  @Permissions(PERMISSIONS.BUSINESS_READ)
  getById(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Put(':id')
  @Permissions(PERMISSIONS.BUSINESS_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.BUSINESS_DELETE)
  softDelete(@Param('id') id: string) {
    return this.tenantsService.softDelete(id);
  }
}
