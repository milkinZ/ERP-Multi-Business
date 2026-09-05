import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Worker, type Job } from "bullmq";

import { QUEUE_NAMES, type QueueName } from "../queue/queue.constants";
import type { NotificationDispatchJobPayload } from "../queue/queue.types";

const QUEUE_NAME: QueueName = QUEUE_NAMES.NOTIFICATION_QUEUE;

type TypedJob = Job<NotificationDispatchJobPayload>;

@Injectable()
export class NotificationDispatchProcessor implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatchProcessor.name);
  private readonly worker: Worker;

  constructor() {
    // Wrap the processor with OTEL instrumentation if available
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { wrapProcessor } = require('../observability/worker-instrumentation');
    this.worker = new Worker(QUEUE_NAME, wrapProcessor('notification.dispatch', async (job: TypedJob) => {
      const payload = job.data;
      await Promise.resolve();

      this.logger.log(
        `Processing notification dispatch for tenant=${payload.tenantId} channels=${payload.notification.channels.join(", ")}`,
      );

      // Worker contract: push notification payload to downstream delivery services.
      // This is a scaffold for later transport implementations.
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
    }));
  }

  async onModuleDestroy() {
    await this.worker.close();
  }
}
