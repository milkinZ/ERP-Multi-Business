import { Module } from "@nestjs/common";

import { JobExecutionHistoryService } from "./operational/job-execution-history.service";
import { WorkerRegistryService } from "./operational/worker-registry.service";
import { PrismaModule } from "./prisma/prisma.module";
import { QueueModule } from "./queue/queue.module";
import { NotificationDispatchProcessor } from "./queues/notification-dispatch.processor";
import { ExpireReservationsProcessor } from "./queues/expire-reservations.processor";
import { RedisModule } from "./shared/redis.module";
import { SharedModule } from "./shared/shared.module";
import { NotificationEmailSender } from "./notifications/notification-email.sender";
import { NotificationDeliveryService } from "./notifications/notification-delivery.service";
import { PlatformOperationsSignalPublisher } from "./operational/platform-operations-signal.publisher";

@Module({
  imports: [PrismaModule, QueueModule, RedisModule, SharedModule],
  providers: [
    NotificationDispatchProcessor,
    NotificationEmailSender,
    NotificationDeliveryService,
    ExpireReservationsProcessor,
    WorkerRegistryService,
    JobExecutionHistoryService,
    PlatformOperationsSignalPublisher,
  ],
})
export class AppModule {}
