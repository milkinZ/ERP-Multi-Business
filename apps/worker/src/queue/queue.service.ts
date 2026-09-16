import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Queue, JobsOptions } from "bullmq";

import { RedisService } from "../shared/redis.service";
import { type QueueName } from "./queue.constants";
import { WORKER_CONFIG } from "./worker-config";

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues = new Map<QueueName, Queue>();

  constructor(private readonly redis: RedisService) {}

  getQueue(name: QueueName): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;

    const queue = new Queue(name, {
      connection: this.redis.getConnectionOptions(),
      defaultJobOptions: {
        attempts: WORKER_CONFIG.attempts,
        backoff: {
          type: "exponential",
          delay: WORKER_CONFIG.backoffDelayMs,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });

    this.queues.set(name, queue);
    return queue;
  }

  async onModuleDestroy() {
    for (const q of this.queues.values()) {
      await q.close();
    }
    this.queues.clear();
  }

  async add(
    name: QueueName,
    payload: Record<string, unknown>,
    opts?: JobsOptions,
  ) {
    return this.getQueue(name).add("job", payload, opts);
  }
}
