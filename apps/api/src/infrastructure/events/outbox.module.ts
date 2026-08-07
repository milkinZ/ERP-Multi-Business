import { Module } from '@nestjs/common';

import { DomainEventsModule } from '../../core/events/domain-events.module';
import { OutboxDispatcherService } from '../../core/events/outbox-dispatcher.service';
import { OutboxPublisher } from './outbox.publisher';

import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [DomainEventsModule, PrismaModule],
  providers: [OutboxDispatcherService, OutboxPublisher],
  exports: [OutboxDispatcherService, OutboxPublisher],
})
export class OutboxModule {}
