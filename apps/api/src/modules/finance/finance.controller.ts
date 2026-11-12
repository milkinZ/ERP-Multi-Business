import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorator/current-user.decorator';
import { Permissions } from '../../common/decorator/permissions.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { PERMISSIONS } from '../rbac/permissions';
import { AccountingService } from './accounting.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { CreatePeriodDto } from './dto/create-period.dto';
import { CreateTaxRuleDto } from './dto/create-tax-rule.dto';
import { MapAccountDto } from './dto/map-account.dto';
import { UpdateAccountingSettingsDto } from './dto/update-accounting-settings.dto';
import { FeatureModuleGuard } from '../feature-flags/feature-module.guard';
import { RequireFeatureModule } from '../subscription/plans/feature-module.decorator';

@UseGuards(JwtAuthGuard, PermissionGuard, FeatureModuleGuard)
@Controller('finance')
@RequireFeatureModule('FINANCE')
export class FinanceController {
  constructor(private readonly accounting: AccountingService) {}

  @Get('accounts')
  @Permissions(PERMISSIONS.FINANCE_READ)
  listAccounts(@CurrentUser() user: JwtUser) {
    return this.accounting.listAccounts(user.tenantId);
  }

  @Post('accounts')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  createAccount(@CurrentUser() user: JwtUser, @Body() dto: CreateAccountDto) {
    return this.accounting.createAccount(user.tenantId, dto);
  }

  @Post('account-mappings')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  mapAccount(@CurrentUser() user: JwtUser, @Body() dto: MapAccountDto) {
    return this.accounting.mapAccount(user.tenantId, dto);
  }

  @Get('periods')
  @Permissions(PERMISSIONS.FINANCE_READ)
  listPeriods(@CurrentUser() user: JwtUser) {
    return this.accounting.listPeriods(user.tenantId);
  }

  @Post('periods')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  createPeriod(@CurrentUser() user: JwtUser, @Body() dto: CreatePeriodDto) {
    return this.accounting.createPeriod(user.tenantId, dto);
  }

  @Post('periods/:id/close')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  closePeriod(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.accounting.closePeriod(user.tenantId, id);
  }

  @Get('settings')
  @Permissions(PERMISSIONS.FINANCE_READ)
  getSettings(@CurrentUser() user: JwtUser) {
    return this.accounting.getSettings(user.tenantId);
  }

  @Patch('settings')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  updateSettings(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateAccountingSettingsDto,
  ) {
    return this.accounting.updateSettings(user.tenantId, dto);
  }

  @Get('tax-rules')
  @Permissions(PERMISSIONS.FINANCE_READ)
  listTaxRules(@CurrentUser() user: JwtUser) {
    return this.accounting.listTaxRules(user.tenantId);
  }

  @Post('tax-rules')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  createTaxRule(@CurrentUser() user: JwtUser, @Body() dto: CreateTaxRuleDto) {
    return this.accounting.createTaxRule(user.tenantId, dto);
  }

  @Get('journals')
  @Permissions(PERMISSIONS.FINANCE_READ)
  listJournals(
    @CurrentUser() user: JwtUser,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.accounting.listJournals(
      user.tenantId,
      skip === undefined ? 0 : Number.parseInt(skip, 10),
      take === undefined ? 50 : Number.parseInt(take, 10),
    );
  }
}
