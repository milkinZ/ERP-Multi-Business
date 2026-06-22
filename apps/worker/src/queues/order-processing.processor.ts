import { Worker } from 'bullmq';

import { QUEUE_NAMES, type QueueName } from '../queue/queue.constants';
import type {
  JobPayloadByQueue,
  OrderProcessingJobPayload,
} from '../queue/queue.types';

import type { Job } from 'bullmq';

const QUEUE_NAME: QueueName = QUEUE_NAMES.ORDER_QUEUE;

type TypedJob = Job<OrderProcessingJobPayload>;

export class OrderProcessingProcessor {
  private worker: Worker;

  constructor(processor: (job: TypedJob) => Promise<void>) {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => processor(job as TypedJob),
    );
  }


  async start() {
    // bullmq worker starts immediately on construction
  }

  async shutdown() {
    await this.worker.close();
  }
}


