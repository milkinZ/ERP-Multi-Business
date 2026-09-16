import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { Worker } from "bullmq";

import { QUEUE_NAMES, type QueueName } from "../queue/queue.constants";
import { getWorkerOptions } from "../queue/worker-config";
import type { AnalyticsAggregationJobPayload } from "../queue/queue.types";

import type { Job } from "bullmq";
import { RedisService } from "../shared/redis.service";
import { wrapProcessor } from "../observability/worker-instrumentation";

const QUEUE_NAME: QueueName = QUEUE_NAMES.ANALYTICS_QUEUE;

type TypedJob = Job<AnalyticsAggregationJobPayload>;

@Injectable()
export class AnalyticsAggregationProcessor implements OnModuleDestroy {
  private readonly worker: Worker;

  constructor(
    redisOrProcessor?: RedisService | ((job: TypedJob) => Promise<void>),
    processor?: (job: TypedJob) => Promise<void>,
  ) {
    const redis =
      redisOrProcessor instanceof RedisService
        ? redisOrProcessor
        : new RedisService();
    const jobProcessor =
      typeof redisOrProcessor === "function"
        ? redisOrProcessor
        : (processor ?? (() => undefined));

    this.worker = new Worker(
      QUEUE_NAME,
      wrapProcessor("analytics-aggregation", async (job: TypedJob) =>
        jobProcessor(job),
      ),
      getWorkerOptions(redis.getConnectionOptions()),
    );
  }

  async shutdown() {
    await this.worker.close();
  }

  async onModuleDestroy() {
    await this.shutdown();
  }
}
