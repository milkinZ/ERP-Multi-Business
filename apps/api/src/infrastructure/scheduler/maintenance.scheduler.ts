import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { OutboxDispatcherService } from '../../core/events/outbox-dispatcher.service';
import { requestContext } from '../../core/request-context/request-context';
import { AutopayService } from '../../modules/billing/autopay.service';
import { PlatformSchedulerExecutionService } from './platform-scheduler-execution.service';

@Injectable()
export class MaintenanceScheduler {
  private readonly logger = new Logger(MaintenanceScheduler.name);

  constructor(
    private readonly outbox: OutboxDispatcherService,
    private readonly autopay: AutopayService,
    private readonly executionHistory: PlatformSchedulerExecutionService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'outbox-dispatch' })
  async dispatchOutbox(): Promise<void> {
    try {
      await this.executionHistory.execute('outbox-dispatch', () =>
        requestContext.run({ systemOperation: 'outbox-dispatch' }, () =>
          this.outbox.dispatchBatch(),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Scheduled outbox dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'subscription-autopay' })
  async processAutopay(): Promise<void> {
    try {
      await this.executionHistory.execute('subscription-autopay', () =>
        requestContext.run({ systemOperation: 'subscription-autopay' }, () =>
          this.autopay.processScheduledAutopay(),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Scheduled autopay processing failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
