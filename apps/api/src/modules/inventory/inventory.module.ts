import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryRepository } from './inventory.repository';
import { InventoryReservationService } from './inventory-reservation.service';
import { ReservationRepository } from './reservation.repository';
import { ReservationExpirationRegistrar } from './reservation-expiration-registrar.service';
import { PrismaModule } from '../../core/database/prisma.module';
import { QueueModule } from '../../infrastructure/queue/queue.module';

@Module({
  imports: [PrismaModule, QueueModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryRepository,
    InventoryReservationService,
    ReservationRepository,
    ReservationExpirationRegistrar,
  ],
  exports: [InventoryService, InventoryReservationService, InventoryRepository],
})
export class InventoryModule {}
