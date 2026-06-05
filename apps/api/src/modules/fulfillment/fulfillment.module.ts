import { Module } from '@nestjs/common';

import { FulfillmentService } from './fulfillment.service';

import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [FulfillmentService],
  exports: [FulfillmentService],
})
export class FulfillmentModule {}
