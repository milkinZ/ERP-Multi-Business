import { Module } from '@nestjs/common';

import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsRepository } from './payments.repository';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';
import { PrismaModule } from '../../core/database/prisma.module';
import { DomainEventsModule } from '../../core/events/domain-events.module';

@Module({
  imports: [PrismaModule, FulfillmentModule, DomainEventsModule],

  controllers: [PaymentsController],

  providers: [PaymentsService, PaymentsRepository],
})
export class PaymentsModule {}
