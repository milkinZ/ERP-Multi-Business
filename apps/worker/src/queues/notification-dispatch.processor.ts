import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Worker, type Job } from "bullmq";

import { QUEUE_NAMES, type QueueName } from "../queue/queue.constants";
import { getWorkerOptions } from "../queue/worker-config";
import type { NotificationDispatchJobPayload } from "../queue/queue.types";
import { RedisService } from "../shared/redis.service";
import { wrapProcessor } from "../observability/worker-instrumentation";

const QUEUE_NAME: QueueName = QUEUE_NAMES.NOTIFICATION_QUEUE;

type TypedJob = Job<NotificationDispatchJobPayload>;

@Injectable()
export class NotificationDispatchProcessor implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatchProcessor.name);
  private readonly worker: Worker;

  constructor(private readonly redis: RedisService) {
    this.worker = new Worker(
      QUEUE_NAME,
      wrapProcessor("notification.dispatch", async (job: TypedJob) => {
        const payload = job.data;
        await Promise.resolve();

        this.logger.log(
          `Processing notification dispatch for tenant=${payload.tenantId} channels=${payload.notification.channels.join(", ")}`,
        );

        if (payload.notification.channels.includes("EMAIL")) {
          this.logger.log(
            `Email notification queued for dispatch: ${payload.notification.type}`,
          );
        }

        if (payload.notification.channels.includes("IN_APP")) {
          this.logger.log(
            `In-app notification available for recipient=${payload.recipientId ?? "none"}`,
          );
        }
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
