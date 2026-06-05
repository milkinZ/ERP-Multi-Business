import { Module } from '@nestjs/common';

import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../core/database/prisma.service';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';

@Module({
  imports: [FulfillmentModule],

  controllers: [PaymentsController],

  providers: [PaymentsService, PrismaService],
})
export class PaymentsModule {}
