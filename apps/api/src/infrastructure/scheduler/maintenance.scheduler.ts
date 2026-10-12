import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { OutboxDispatcherService } from '../../core/events/outbox-dispatcher.service';
import { requestContext } from '../../core/request-context/request-context';

@Injectable()
export class MaintenanceScheduler {
  private readonly logger = new Logger(MaintenanceScheduler.name);

  constructor(private readonly outbox: OutboxDispatcherService) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'outbox-dispatch' })
  async dispatchOutbox(): Promise<void> {
    try {
      await requestContext.run({ systemOperation: 'outbox-dispatch' }, () =>
        this.outbox.dispatchBatch(),
      );
    } catch (error) {
      this.logger.error(
        `Scheduled outbox dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
