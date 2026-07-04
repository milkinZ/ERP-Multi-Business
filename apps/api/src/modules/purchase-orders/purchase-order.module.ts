import { Module } from '@nestjs/common';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseOrderController } from './purchase-order.controller';
import { DomainEventsModule } from '../../core/events/domain-events.module';
import { PrismaModule } from '../../core/database/prisma.module';
import { PurchaseOrderRepository } from './purchase-order.repository';

@Module({
  imports: [PrismaModule, DomainEventsModule],
  controllers: [PurchaseOrderController],
  providers: [PurchaseOrderService, PurchaseOrderRepository],
  exports: [PurchaseOrderService],
})
export class PurchaseOrderModule {}
