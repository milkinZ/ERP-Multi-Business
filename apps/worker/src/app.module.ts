import { Module } from "@nestjs/common";

import { PrismaModule } from "./prisma/prisma.module";
import { QueueModule } from "./queue/queue.module";
import { NotificationDispatchProcessor } from "./queues/notification-dispatch.processor";
import { ExpireReservationsProcessor } from "./queues/expire-reservations.processor";
import { SharedModule } from "./shared/shared.module";

@Module({
  imports: [PrismaModule, QueueModule, SharedModule],
  providers: [NotificationDispatchProcessor, ExpireReservationsProcessor],
})
export class AppModule {}
