import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { Permissions } from '../../common/decorator/permissions.decorator';
import { CurrentUser } from '../../common/decorator/current-user.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';

import { SuperAdminService } from './super-admin.service';
import { SuperAdminTenantQueryDto } from './dto/super-admin-query.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { ChangeTenantPlanDto } from './dto/change-tenant-plan.dto';
import { TenantActionDto } from './dto/tenant-action.dto';

@ApiTags('super-admin')
@ApiBearerAuth()
@Controller('super-admin')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  // ---- Tenants -----------------------------------------------------------

  @Get('tenants')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  listTenants(@Query() query: SuperAdminTenantQueryDto) {
    return this.superAdminService.listTenants(query);
  }

  @Get('tenants/:tenantId')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  getTenant(@Param('tenantId') tenantId: string) {
    return this.superAdminService.getTenant(tenantId);
  }

  @Post('tenants/:tenantId/activate')
  @Permissions(PERMISSIONS.SUPER_ADMIN_MANAGE_TENANTS)
  activateTenant(
    @CurrentUser() user: JwtUser,
    @Param('tenantId') tenantId: string,
  ) {
    return this.superAdminService.activateTenant(
      { userId: user.userId, tenantId: user.tenantId },
      tenantId,
    );
  }

  @Post('tenants/:tenantId/suspend')
  @Permissions(PERMISSIONS.SUPER_ADMIN_MANAGE_TENANTS)
  suspendTenant(
    @CurrentUser() user: JwtUser,
    @Param('tenantId') tenantId: string,
    @Body() dto: TenantActionDto,
  ) {
    return this.superAdminService.suspendTenant(
      { userId: user.userId, tenantId: user.tenantId },
      tenantId,
      dto.reason,
    );
  }

  @Delete('tenants/:tenantId')
  @Permissions(PERMISSIONS.SUPER_ADMIN_MANAGE_TENANTS)
  deactivateTenant(
    @CurrentUser() user: JwtUser,
    @Param('tenantId') tenantId: string,
    @Body() dto: TenantActionDto,
  ) {
    return this.superAdminService.deactivateTenant(
      { userId: user.userId, tenantId: user.tenantId },
      tenantId,
      dto.reason,
    );
  }

  @Post('tenants/:tenantId/restore')
  @Permissions(PERMISSIONS.SUPER_ADMIN_MANAGE_TENANTS)
  restoreTenant(
    @CurrentUser() user: JwtUser,
    @Param('tenantId') tenantId: string,
  ) {
    return this.superAdminService.restoreTenant(
      { userId: user.userId, tenantId: user.tenantId },
      tenantId,
    );
  }

  // ---- Plans -------------------------------------------------------------

  @Get('plans')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  listPlans() {
    return this.superAdminService.listPlans();
  }

  @Post('plans')
  @Permissions(PERMISSIONS.SUPER_ADMIN_MANAGE_PLANS)
  createPlan(@Body() dto: CreatePlanDto) {
    return this.superAdminService.createPlan(dto);
  }

  @Put('plans/:id')
  @Permissions(PERMISSIONS.SUPER_ADMIN_MANAGE_PLANS)
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.superAdminService.updatePlan(id, dto);
  }

  @Delete('plans/:id')
  @Permissions(PERMISSIONS.SUPER_ADMIN_MANAGE_PLANS)
  deletePlan(@Param('id') id: string) {
    return this.superAdminService.deletePlan(id);
  }

  // ---- Subscriptions & Billing ------------------------------------------

  @Get('subscriptions')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  listSubscriptions() {
    return this.superAdminService.listSubscriptions();
  }

  @Put('tenants/:tenantId/plan')
  @Permissions(PERMISSIONS.SUPER_ADMIN_MANAGE_SUBSCRIPTIONS)
  changeTenantPlan(
    @CurrentUser() user: JwtUser,
    @Param('tenantId') tenantId: string,
    @Body() dto: ChangeTenantPlanDto,
  ) {
    return this.superAdminService.changeTenantPlan(
      { userId: user.userId, tenantId: user.tenantId },
      tenantId,
      dto.planId,
    );
  }

  @Get('invoices')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  listInvoices() {
    return this.superAdminService.listInvoices();
  }

  // ---- Feature flags -----------------------------------------------------

  @Get('feature-flags')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  listFeatureFlags() {
    return this.superAdminService.listFeatureFlags();
  }
}
