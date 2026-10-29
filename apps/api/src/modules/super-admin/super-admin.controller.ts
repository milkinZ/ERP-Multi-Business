import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PlatformJwtAuthGuard } from '../auth/platform-jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { Permissions } from '../../common/decorator/permissions.decorator';
import { CurrentUser } from '../../common/decorator/current-user.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import type { PlatformJwtUser } from '../../common/interfaces/jwt-user.interface';

import { SuperAdminService } from './super-admin.service';
import { SuperAdminTenantQueryDto } from './dto/super-admin-query.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { ChangeTenantPlanDto } from './dto/change-tenant-plan.dto';
import { TenantActionDto } from './dto/tenant-action.dto';
import { ListPlatformAuditLogsDto } from '../audit-logs/dto/list-platform-audit-logs.dto';
import { ListPlatformJobExecutionsDto } from './dto/list-platform-job-executions.dto';
import { UpdatePlatformSettingDto } from './dto/update-platform-setting.dto';
import { PlatformSettingsService } from './platform-settings.service';
import { InvoiceExportQueryDto } from '../billing/dto/invoice-export-query.dto';

@ApiTags('super-admin')
@ApiBearerAuth()
@Controller('super-admin')
@UseGuards(PlatformJwtAuthGuard, PermissionGuard)
export class SuperAdminController {
  constructor(
    private readonly superAdminService: SuperAdminService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

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
    @CurrentUser() user: PlatformJwtUser,
    @Param('tenantId') tenantId: string,
  ) {
    return this.superAdminService.activateTenant(
      { platformIdentityId: user.platformIdentityId },
      tenantId,
    );
  }

  @Post('tenants/:tenantId/suspend')
  @Permissions(PERMISSIONS.SUPER_ADMIN_MANAGE_TENANTS)
  suspendTenant(
    @CurrentUser() user: PlatformJwtUser,
    @Param('tenantId') tenantId: string,
    @Body() dto: TenantActionDto,
  ) {
    return this.superAdminService.suspendTenant(
      { platformIdentityId: user.platformIdentityId },
      tenantId,
      dto.reason,
    );
  }

  @Delete('tenants/:tenantId')
  @Permissions(PERMISSIONS.SUPER_ADMIN_MANAGE_TENANTS)
  deactivateTenant(
    @CurrentUser() user: PlatformJwtUser,
    @Param('tenantId') tenantId: string,
    @Body() dto: TenantActionDto,
  ) {
    return this.superAdminService.deactivateTenant(
      { platformIdentityId: user.platformIdentityId },
      tenantId,
      dto.reason,
    );
  }

  @Post('tenants/:tenantId/restore')
  @Permissions(PERMISSIONS.SUPER_ADMIN_MANAGE_TENANTS)
  restoreTenant(
    @CurrentUser() user: PlatformJwtUser,
    @Param('tenantId') tenantId: string,
  ) {
    return this.superAdminService.restoreTenant(
      { platformIdentityId: user.platformIdentityId },
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

  @Get('subscriptions/:id')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  getSubscription(@Param('id') id: string) {
    return this.superAdminService.getSubscription(id);
  }

  @Get('workers')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  listWorkers() {
    return this.superAdminService.listWorkers();
  }

  @Get('workers/:id')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  getWorker(@Param('id') id: string) {
    return this.superAdminService.getWorker(id);
  }

  @Get('job-executions')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  listJobExecutions(@Query() query: ListPlatformJobExecutionsDto) {
    return this.superAdminService.listJobExecutions(query);
  }

  @Get('billing/aggregate')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  getBillingAggregate() {
    return this.superAdminService.getBillingAggregate();
  }

  @Get('invoices-export.csv')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="platform-invoices.csv"')
  async exportInvoices(
    @CurrentUser() user: PlatformJwtUser,
    @Query() query: InvoiceExportQueryDto,
  ) {
    return new StreamableFile(
      await this.superAdminService.exportInvoices(
        { platformIdentityId: user.platformIdentityId },
        query,
      ),
    );
  }

  @Get('settings')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  listPlatformSettings() {
    return this.platformSettings.list();
  }

  @Put('settings/:key')
  @Permissions(PERMISSIONS.SUPER_ADMIN_MANAGE_SYSTEM)
  updatePlatformSetting(
    @CurrentUser() user: PlatformJwtUser,
    @Param('key') key: string,
    @Body() dto: UpdatePlatformSettingDto,
  ) {
    return this.platformSettings.update(
      { platformIdentityId: user.platformIdentityId },
      key,
      dto.value,
      dto.expectedVersion,
    );
  }

  @Put('tenants/:tenantId/plan')
  @Permissions(PERMISSIONS.SUPER_ADMIN_MANAGE_SUBSCRIPTIONS)
  changeTenantPlan(
    @CurrentUser() user: PlatformJwtUser,
    @Param('tenantId') tenantId: string,
    @Body() dto: ChangeTenantPlanDto,
  ) {
    return this.superAdminService.changeTenantPlan(
      { platformIdentityId: user.platformIdentityId },
      tenantId,
      dto.planId,
    );
  }

  @Get('invoices')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  listInvoices() {
    return this.superAdminService.listInvoices();
  }

  @Get('invoices/:id')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  getInvoice(@Param('id') id: string) {
    return this.superAdminService.getInvoice(id);
  }

  @Get('audit-logs')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  listAuditLogs(@Query() query: ListPlatformAuditLogsDto) {
    return this.superAdminService.listPlatformAuditLogs(query);
  }

  @Get('audit-logs/:id')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  getAuditLog(@Param('id') id: string) {
    return this.superAdminService.getPlatformAuditLog(id);
  }

  // ---- Feature flags -----------------------------------------------------

  @Get('feature-flags')
  @Permissions(PERMISSIONS.SUPER_ADMIN_READ)
  listFeatureFlags() {
    return this.superAdminService.listFeatureFlags();
  }
}
