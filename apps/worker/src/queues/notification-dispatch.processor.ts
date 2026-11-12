import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Worker, type Job } from "bullmq";

import { QUEUE_NAMES, type QueueName } from "../queue/queue.constants";
import { getWorkerOptions } from "../queue/worker-config";
import type { NotificationDispatchJobPayload } from "../queue/queue.types";
import { RedisService } from "../shared/redis.service";
import { wrapProcessor } from "../observability/worker-instrumentation";
import { NotificationDeliveryService } from "../notifications/notification-delivery.service";

const QUEUE_NAME: QueueName = QUEUE_NAMES.NOTIFICATION_QUEUE;

type TypedJob = Job<NotificationDispatchJobPayload>;

@Injectable()
export class NotificationDispatchProcessor implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatchProcessor.name);
  private readonly worker: Worker;

  constructor(
    private readonly redis: RedisService,
    private readonly deliveryService: NotificationDeliveryService,
  ) {
    this.worker = new Worker(
      QUEUE_NAME,
      wrapProcessor("notification.dispatch", async (job: TypedJob) => {
        await this.deliveryService.dispatch(job.data);
        this.logger.log(
          `Notification dispatch completed tenant=${job.data.tenantId} recipient=${job.data.recipientId} type=${job.data.notification.type}`,
        );
      }),
      getWorkerOptions(this.redis.getConnectionOptions()),
    );
  }

  async shutdown() {
    await this.worker.close();
  }

  async onModuleDestroy() {
    await this.shutdown();
  }
}
