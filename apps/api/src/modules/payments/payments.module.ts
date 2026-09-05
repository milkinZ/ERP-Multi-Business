import { Module } from '@nestjs/common';

import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsRepository } from './payments.repository';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';
import { PrismaModule } from '../../core/database/prisma.module';
import { DomainEventsModule } from '../../core/events/domain-events.module';
import { OutboxModule } from '../../infrastructure/events/outbox.module';

@Module({
  imports: [PrismaModule, FulfillmentModule, DomainEventsModule, OutboxModule],

  controllers: [PaymentsController],

  providers: [PaymentsService, PaymentsRepository],
})
export class PaymentsModule {}
