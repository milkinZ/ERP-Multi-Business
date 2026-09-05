import { Module } from '@nestjs/common';

import { FulfillmentService } from './fulfillment.service';

import { PrismaModule } from '../../core/database/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [PrismaModule, InventoryModule],
  providers: [FulfillmentService],
  exports: [FulfillmentService],
})
export class FulfillmentModule {}
