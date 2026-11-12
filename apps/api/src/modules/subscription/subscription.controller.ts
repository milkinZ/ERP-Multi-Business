import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { Permissions } from '../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import { CurrentUser } from '../../common/decorator/current-user.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { SubscriptionService } from './subscription.service';
import { SubscriptionHistoryQueryDto } from './dto/subscription-history-query.dto';
import { UpdateSubscriptionModulesDto } from './dto/update-subscription-modules.dto';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PlanEntitlementsService } from './plans/plan-entitlements.service';

class CreateSubscriptionDto {
  @IsString()
  @MaxLength(100)
  planId!: string;
}

class ChangePlanDto {
  @IsString()
  @MaxLength(100)
  planId!: string;
}

class CancelSubscriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

@Controller('subscriptions')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly planEntitlements: PlanEntitlementsService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.SUBSCRIPTION_READ)
  getAll() {
    return this.subscriptionService.getAllSubscriptions();
  }

  @Get('current')
  @Permissions(PERMISSIONS.SUBSCRIPTION_READ)
  getCurrent() {
    return this.subscriptionService.getCurrentSubscription();
  }

  @Get('usage')
  @Permissions(PERMISSIONS.SUBSCRIPTION_READ)
  getUsage() {
    return this.subscriptionService.getCurrentUsage();
  }

  @Get(':id/history')
  @Permissions(PERMISSIONS.SUBSCRIPTION_READ)
  getHistory(
    @Param('id') id: string,
    @Query() query: SubscriptionHistoryQueryDto,
  ) {
    return this.subscriptionService.getSubscriptionHistory(id, query);
  }

  @Get('plans')
  @Permissions(PERMISSIONS.SUBSCRIPTION_READ)
  listPlans() {
    return this.subscriptionService.listPlans();
  }

  @Get('feature-entitlements')
  getFeatureEntitlements(@CurrentUser() user: JwtUser) {
    return this.planEntitlements
      .getForTenant(user.tenantId)
      .then((entitlements) => ({
        featureModules: entitlements.featureModuleKeys,
      }));
  }

  @Get(':id')
  @Permissions(PERMISSIONS.SUBSCRIPTION_READ)
  getById(@Param('id') id: string) {
    return this.subscriptionService.getSubscriptionById(id);
  }

  @Post()
  @Permissions(PERMISSIONS.SUBSCRIPTION_CREATE)
  create(@Body() dto: CreateSubscriptionDto) {
    return this.subscriptionService.createSubscription(dto.planId);
  }

  @Put(':id/plan')
  @Permissions(PERMISSIONS.SUBSCRIPTION_UPDATE)
  changePlan(@Param('id') id: string, @Body() dto: ChangePlanDto) {
    return this.subscriptionService.changePlan(id, dto.planId);
  }

  @Get(':id/modules')
  @Permissions(PERMISSIONS.SUBSCRIPTION_READ)
  getModules(@Param('id') id: string) {
    return this.subscriptionService.getSubscriptionModules(id);
  }

  @Put(':id/modules')
  @Permissions(PERMISSIONS.SUBSCRIPTION_UPDATE)
  updateModules(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionModulesDto,
  ) {
    return this.subscriptionService.scheduleSubscriptionModules(id, dto);
  }

  @Post(':id/cancel')
  @Permissions(PERMISSIONS.SUBSCRIPTION_CANCEL)
  cancel(@Param('id') id: string, @Body() dto: CancelSubscriptionDto) {
    return this.subscriptionService.cancelSubscription(id, dto.reason);
  }

  @Post(':id/suspend')
  @Permissions(PERMISSIONS.SUBSCRIPTION_UPDATE)
  suspend(@Param('id') id: string, @Body() dto: CancelSubscriptionDto) {
    return this.subscriptionService.suspendSubscription(id, dto.reason);
  }

  @Post(':id/resume')
  @Permissions(PERMISSIONS.SUBSCRIPTION_UPDATE)
  resume(@Param('id') id: string) {
    return this.subscriptionService.resumeSubscription(id);
  }
}
