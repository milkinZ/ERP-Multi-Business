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
import { SubscriptionService } from './subscription.service';
import { SubscriptionHistoryQueryDto } from './dto/subscription-history-query.dto';
import { IsOptional, IsString, MaxLength } from 'class-validator';

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
  constructor(private readonly subscriptionService: SubscriptionService) {}

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
