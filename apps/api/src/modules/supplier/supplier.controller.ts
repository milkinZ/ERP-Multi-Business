import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { CurrentUser } from '../../common/decorator/current-user.decorator';
import { Permissions } from '../../common/decorator/permissions.decorator';

import { SupplierService } from './supplier.service';

import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { PermissionGuard } from '../rbac/permission.guard';
import { PERMISSIONS } from '../rbac/permissions';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('suppliers')
export class SupplierController {
  constructor(private supplierService: SupplierService) {}

  @Post()
  @Permissions(PERMISSIONS.SUPPLIER_CREATE)
  create(
    @Body()
    dto: CreateSupplierDto,

    @CurrentUser()
    user: any,
  ) {
    return this.supplierService.create(user.tenantId, dto);
  }

  @Get()
  @Permissions(PERMISSIONS.SUPPLIER_READ)
  findAll(
    @CurrentUser()
    user: any,
  ) {
    return this.supplierService.findAll(user.tenantId);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.SUPPLIER_READ)
  findOne(
    @Param('id') id: string,

    @CurrentUser()
    user: any,
  ) {
    return this.supplierService.findOne(id, user.tenantId);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.SUPPLIER_UPDATE)
  update(
    @Param('id') id: string,

    @Body()
    dto: UpdateSupplierDto,

    @CurrentUser()
    user: any,
  ) {
    return this.supplierService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.SUPPLIER_DELETE)
  remove(
    @Param('id') id: string,

    @CurrentUser()
    user: any,
  ) {
    return this.supplierService.remove(id, user.tenantId);
  }
}
