import { Worker } from "bullmq";

import { QUEUE_NAMES, type QueueName } from "../queue/queue.constants";
import type { InventorySyncJobPayload } from "../queue/queue.types";

import type { Job } from "bullmq";

const QUEUE_NAME: QueueName = QUEUE_NAMES.INVENTORY_QUEUE;

type TypedJob = Job<InventorySyncJobPayload>;

export class InventorySyncProcessor {
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
