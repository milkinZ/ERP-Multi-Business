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

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { CurrentUser } from '../../common/decorator/current-user.decorator';
import { Permissions } from '../../common/decorator/permissions.decorator';

import { SupplierService } from './supplier.service';

import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { ListSuppliersQueryDto } from './dto/list-suppliers-query.dto';
import {
  CloseSupplierItemOfferDto,
  ListSupplierItemOffersQueryDto,
} from './dto/list-supplier-item-offers-query.dto';
import { CreateSupplierItemOfferDto } from './dto/create-supplier-item-offer.dto';
import { PermissionGuard } from '../rbac/permission.guard';
import { PERMISSIONS } from '../rbac/permissions';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { FeatureModuleGuard } from '../feature-flags/feature-module.guard';
import { RequireFeatureModule } from '../subscription/plans/feature-module.decorator';

@UseGuards(JwtAuthGuard, PermissionGuard, FeatureModuleGuard)
@Controller('suppliers')
@RequireFeatureModule('PROCUREMENT')
export class SupplierController {
  constructor(private supplierService: SupplierService) {}

  @Post()
  @Permissions(PERMISSIONS.SUPPLIER_CREATE)
  create(
    @Body()
    dto: CreateSupplierDto,

    @CurrentUser()
    user: JwtUser,
  ) {
    return this.supplierService.create(user.tenantId, dto);
  }

  @Get()
  @Permissions(PERMISSIONS.SUPPLIER_READ)
  findAll(
    @Query()
    query: ListSuppliersQueryDto,

    @CurrentUser()
    user: JwtUser,
  ) {
    return this.supplierService.findAll(user.tenantId, query);
  }

  @Get(':id/offers')
  @Permissions(PERMISSIONS.SUPPLIER_READ, PERMISSIONS.INVENTORY_READ)
  findOffers(
    @Param('id') id: string,
    @Query() query: ListSupplierItemOffersQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.supplierService.findOffers(id, user.tenantId, query);
  }

  @Post(':id/offers')
  @Permissions(PERMISSIONS.SUPPLIER_UPDATE, PERMISSIONS.INVENTORY_READ)
  createOffer(
    @Param('id') id: string,
    @Body() dto: CreateSupplierItemOfferDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.supplierService.createOffer(id, user.tenantId, dto);
  }

  @Patch(':id/offers/:offerId/validity')
  @Permissions(PERMISSIONS.SUPPLIER_UPDATE, PERMISSIONS.INVENTORY_READ)
  closeOffer(
    @Param('id') id: string,
    @Param('offerId') offerId: string,
    @Body() dto: CloseSupplierItemOfferDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.supplierService.closeOffer(
      id,
      offerId,
      user.tenantId,
      dto.effectiveTo,
    );
  }

  @Get(':id')
  @Permissions(PERMISSIONS.SUPPLIER_READ)
  findOne(
    @Param('id') id: string,

    @CurrentUser()
    user: JwtUser,
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
    user: JwtUser,
  ) {
    return this.supplierService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.SUPPLIER_DELETE)
  remove(
    @Param('id') id: string,

    @CurrentUser()
    user: JwtUser,
  ) {
    return this.supplierService.remove(id, user.tenantId);
  }
}
