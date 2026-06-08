import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, DomainEventBus],
})
export class OrdersModule {}
