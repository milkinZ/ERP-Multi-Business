import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { Permissions } from '../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import { SubscriptionService } from './subscription.service';
import { IsOptional, IsString } from 'class-validator';

class CreateSubscriptionDto {
  @IsString()
  planId!: string;
}

class ChangePlanDto {
  @IsString()
  planId!: string;
}

class CancelSubscriptionDto {
  @IsOptional()
  @IsString()
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
  changePlan(@Body() dto: ChangePlanDto) {
    return this.subscriptionService.changePlan(dto.planId);
  }

  @Post(':id/cancel')
  @Permissions(PERMISSIONS.SUBSCRIPTION_CANCEL)
  cancel(@Body() dto: CancelSubscriptionDto) {
    return this.subscriptionService.cancelSubscription(dto.reason);
  }
}
