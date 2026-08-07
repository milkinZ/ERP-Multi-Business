import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingRepository } from './billing.repository';
import { SubscriptionModule } from '../subscription/subscription.module';
import { TenantContextModule } from '../tenants/tenant-context.module';
import { PrismaModule } from '../../core/database/prisma.module';
import { OutboxModule } from '../../infrastructure/events/outbox.module';
import { WebhookController } from './webhook/webhook.controller';

@Module({
  imports: [
    PrismaModule,
    TenantContextModule,
    SubscriptionModule,
    OutboxModule,
  ],
  controllers: [BillingController, WebhookController],
  providers: [BillingService, BillingRepository],
  exports: [BillingService, BillingRepository],
})
export class BillingModule {}
