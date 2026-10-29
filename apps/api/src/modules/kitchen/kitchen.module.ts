import { Module } from '@nestjs/common';
import { DomainEventsModule } from '../../core/events/domain-events.module';

import { KitchenController } from './kitchen.controller';
import { KitchenService } from './kitchen.service';
import { KitchenRepository } from './kitchen.repository';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [DomainEventsModule, InventoryModule],
  controllers: [KitchenController],
  providers: [KitchenService, KitchenRepository],
})
export class KitchenModule {}
