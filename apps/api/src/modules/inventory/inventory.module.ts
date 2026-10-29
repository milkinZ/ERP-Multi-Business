import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryRepository } from './inventory.repository';
import { InventoryReservationService } from './inventory-reservation.service';
import { ReservationRepository } from './reservation.repository';
import { ReservationExpirationRegistrar } from './reservation-expiration-registrar.service';
import { PrismaModule } from '../../core/database/prisma.module';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { WarehouseTransferService } from './warehouse-transfer.service';
import { InventoryCostingService } from './inventory-costing.service';

@Module({
  imports: [PrismaModule, QueueModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryRepository,
    InventoryCostingService,
    WarehouseTransferService,
    InventoryReservationService,
    ReservationRepository,
    ReservationExpirationRegistrar,
  ],
  exports: [
    InventoryService,
    InventoryReservationService,
    InventoryRepository,
    InventoryCostingService,
  ],
})
export class InventoryModule {}
