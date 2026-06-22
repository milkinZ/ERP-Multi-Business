import { Worker } from 'bullmq';

import { QUEUE_NAMES, type QueueName } from '../queue/queue.constants';
import type { NotificationDispatchJobPayload } from '../queue/queue.types';

import type { Job } from 'bullmq';

const QUEUE_NAME: QueueName = QUEUE_NAMES.NOTIFICATION_QUEUE;

type TypedJob = Job<NotificationDispatchJobPayload>;

export class NotificationDispatchProcessor {
  private worker: Worker;

  constructor(processor: (job: TypedJob) => Promise<void>) {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => processor(job as TypedJob),
    );
  }


  async start() {}

  async shutdown() {
    await this.worker.close();
  }
}


