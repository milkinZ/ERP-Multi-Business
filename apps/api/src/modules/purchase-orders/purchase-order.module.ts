import { Module } from '@nestjs/common';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseOrderController } from './purchase-order.controller';
import { DomainEventsModule } from '../../core/events/domain-events.module';
import { PrismaModule } from '../../core/database/prisma.module';
import { PurchaseOrderRepository } from './purchase-order.repository';
import { InventoryCostingService } from '../inventory/inventory-costing.service';

@Module({
  imports: [PrismaModule, DomainEventsModule],
  controllers: [PurchaseOrderController],
  providers: [
    PurchaseOrderService,
    PurchaseOrderRepository,
    InventoryCostingService,
  ],
  exports: [PurchaseOrderService],
})
export class PurchaseOrderModule {}
