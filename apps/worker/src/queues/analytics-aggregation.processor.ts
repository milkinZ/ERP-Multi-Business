import { Worker } from "bullmq";

import { QUEUE_NAMES, type QueueName } from "../queue/queue.constants";
import type { AnalyticsAggregationJobPayload } from "../queue/queue.types";

import type { Job } from "bullmq";

const QUEUE_NAME: QueueName = QUEUE_NAMES.ANALYTICS_QUEUE;

type TypedJob = Job<AnalyticsAggregationJobPayload>;

export class AnalyticsAggregationProcessor {
  private worker: Worker;

  constructor(processor: (job: TypedJob) => Promise<void>) {
    this.worker = new Worker(QUEUE_NAME, async (job) =>
      processor(job as TypedJob),
    );
  }

  async start() {}

  async shutdown() {
    await this.worker.close();
  }
}
