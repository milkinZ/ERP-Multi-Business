import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { OrderOrchestratorService } from './order-orchestrator.service';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrdersRepository,
    DomainEventBus,
    OrderOrchestratorService,
  ],
  exports: [OrdersRepository],
})
export class OrdersModule {}
