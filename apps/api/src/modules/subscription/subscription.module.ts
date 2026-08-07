import { Module } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionRepository } from './domain/subscription.repository';
import { PlanRepository } from './plans/plan.repository';
import { TenantContextModule } from '../tenants/tenant-context.module';
import { PrismaModule } from '../../core/database/prisma.module';
import { OutboxModule } from '../../infrastructure/events/outbox.module';

@Module({
  imports: [PrismaModule, TenantContextModule, OutboxModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, SubscriptionRepository, PlanRepository],
  exports: [SubscriptionService, SubscriptionRepository, PlanRepository],
})
export class SubscriptionModule {}
