import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { DomainEventsModule } from '../../core/events/domain-events.module';
import { OrderOrchestratorService } from './order-orchestrator.service';
import { InventoryModule } from '../inventory/inventory.module';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';

@Module({
  imports: [DomainEventsModule, InventoryModule, FulfillmentModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, OrderOrchestratorService],
  exports: [OrdersRepository],
})
export class OrdersModule {}
