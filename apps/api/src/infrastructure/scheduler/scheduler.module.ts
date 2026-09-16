import { Module } from '@nestjs/common';

import { OutboxModule } from '../events/outbox.module';
import { MaintenanceScheduler } from './maintenance.scheduler';

@Module({
  imports: [OutboxModule],
  providers: [MaintenanceScheduler],
})
export class SchedulerModule {}
