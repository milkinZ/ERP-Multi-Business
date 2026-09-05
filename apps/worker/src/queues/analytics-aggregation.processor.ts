import { Worker } from "bullmq";

import { QUEUE_NAMES, type QueueName } from "../queue/queue.constants";
import type { AnalyticsAggregationJobPayload } from "../queue/queue.types";

import type { Job } from "bullmq";

const QUEUE_NAME: QueueName = QUEUE_NAMES.ANALYTICS_QUEUE;

type TypedJob = Job<AnalyticsAggregationJobPayload>;

export class AnalyticsAggregationProcessor {
  private worker: Worker;

  constructor(processor: (job: TypedJob) => Promise<void>) {
    // Wrap provided processor with OTEL instrumentation when available
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { wrapProcessor } = require('../observability/worker-instrumentation');
    this.worker = new Worker(QUEUE_NAME, wrapProcessor('analytics-aggregation', async (job) =>
      processor(job as TypedJob),
    ));
  }

  async start() {}

  async shutdown() {
    await this.worker.close();
  }
}
