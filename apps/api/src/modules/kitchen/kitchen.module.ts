import { Module } from '@nestjs/common';
import { DomainEventsModule } from '../../core/events/domain-events.module';

import { KitchenController } from './kitchen.controller';
import { KitchenService } from './kitchen.service';
import { KitchenRepository } from './kitchen.repository';

@Module({
  imports: [DomainEventsModule],
  controllers: [KitchenController],
  providers: [KitchenService, KitchenRepository],
})
export class KitchenModule {}
