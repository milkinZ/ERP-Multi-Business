import { Module } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionRepository } from './domain/subscription.repository';
import { PlanRepository } from './plans/plan.repository';
import { PlanEntitlementsService } from './plans/plan-entitlements.service';
import { TenantContextModule } from '../tenants/tenant-context.module';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule, TenantContextModule],
  controllers: [SubscriptionController],
  providers: [
    SubscriptionService,
    SubscriptionRepository,
    PlanRepository,
    PlanEntitlementsService,
  ],
  exports: [
    SubscriptionService,
    SubscriptionRepository,
    PlanRepository,
    PlanEntitlementsService,
  ],
})
export class SubscriptionModule {}
