import { Module } from '@nestjs/common';

import { OutboxModule } from '../events/outbox.module';
import { BillingModule } from '../../modules/billing/billing.module';
import { MaintenanceScheduler } from './maintenance.scheduler';
import { PlatformSchedulerHistoryModule } from './platform-scheduler-history.module';

@Module({
  imports: [OutboxModule, BillingModule, PlatformSchedulerHistoryModule],
  providers: [MaintenanceScheduler],
})
export class SchedulerModule {}
