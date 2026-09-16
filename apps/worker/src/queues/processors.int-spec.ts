import { Job, Queue, QueueEvents, Worker } from "bullmq";

import { assertSafeIntegrationEnvironment } from "../../../api/src/test/integration-environment";
import { AnalyticsAggregationProcessor } from "./analytics-aggregation.processor";
import { InventorySyncProcessor } from "./inventory-sync.processor";
import { OrderProcessingProcessor } from "./order-processing.processor";
import { QUEUE_NAMES } from "../queue/queue.constants";
import { RedisService } from "../shared/redis.service";

type TestQueue = Queue;

const connection = new RedisService().getConnectionOptions();

const queueFor = (name: string): TestQueue => new Queue(name, { connection });

async function waitForJob(job: Job, events: QueueEvents): Promise<unknown> {
  return await job.waitUntilFinished(events, 15000);
}

describe("real BullMQ worker processors", () => {
  let orderQueue: TestQueue;
  let inventoryQueue: TestQueue;
  let analyticsQueue: TestQueue;
  let orderEvents: QueueEvents;
  let inventoryEvents: QueueEvents;
  let analyticsEvents: QueueEvents;

  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    orderQueue = queueFor(QUEUE_NAMES.ORDER_QUEUE);
    inventoryQueue = queueFor(QUEUE_NAMES.INVENTORY_QUEUE);
    analyticsQueue = queueFor(QUEUE_NAMES.ANALYTICS_QUEUE);
    orderEvents = new QueueEvents(QUEUE_NAMES.ORDER_QUEUE, { connection });
    inventoryEvents = new QueueEvents(QUEUE_NAMES.INVENTORY_QUEUE, {
      connection,
    });
    analyticsEvents = new QueueEvents(QUEUE_NAMES.ANALYTICS_QUEUE, {
      connection,
    });
    await Promise.all([
      orderEvents.waitUntilReady(),
      inventoryEvents.waitUntilReady(),
      analyticsEvents.waitUntilReady(),
      orderQueue.waitUntilReady(),
      inventoryQueue.waitUntilReady(),
      analyticsQueue.waitUntilReady(),
    ]);
  });

  beforeEach(async () => {
    await Promise.all([
      orderQueue.obliterate({ force: true }),
      inventoryQueue.obliterate({ force: true }),
      analyticsQueue.obliterate({ force: true }),
    ]);
  });

  afterAll(async () => {
    await Promise.all([
      orderEvents.close(),
      inventoryEvents.close(),
      analyticsEvents.close(),
      orderQueue.close(),
      inventoryQueue.close(),
      analyticsQueue.close(),
    ]);
  });

  it("executes an order job through a real Worker and preserves tenant payload", async () => {
    const received: unknown[] = [];
    const processor = new OrderProcessingProcessor(async (job) => {
      received.push(job.data);
      await Promise.resolve();
    });

    const job = await orderQueue.add("order-processing", {
      orderId: "worker-order-a",
      tenantId: "worker-tenant-a",
      outletId: "worker-outlet-a",
    });

    await expect(waitForJob(job, orderEvents)).resolves.toBeNull();
    expect(received).toEqual([
      {
        orderId: "worker-order-a",
        tenantId: "worker-tenant-a",
        outletId: "worker-outlet-a",
      },
    ]);
    await processor.shutdown();
  });

  it("executes an inventory job through a real Worker", async () => {
    const received: unknown[] = [];
    const processor = new InventorySyncProcessor(async (job) => {
      received.push(job.data);
      await Promise.resolve();
    });

    const job = await inventoryQueue.add("inventory-sync", {
      tenantId: "worker-tenant-a",
    });

    await expect(waitForJob(job, inventoryEvents)).resolves.toBeNull();
    expect(received).toEqual([{ tenantId: "worker-tenant-a" }]);
    await processor.shutdown();
  });

  it("retries a failed analytics job and records the final failure", async () => {
    let attempts = 0;
    const processor = new AnalyticsAggregationProcessor(async () => {
      attempts += 1;
      await Promise.resolve();
      throw new Error("analytics unavailable");
    });

    const job = await analyticsQueue.add(
      "analytics-sync",
      { tenantId: "worker-tenant-a" },
      { attempts: 2, backoff: { type: "fixed", delay: 10 } },
    );

    try {
      await expect(waitForJob(job, analyticsEvents)).rejects.toThrow(
        "analytics unavailable",
      );
      expect(attempts).toBe(2);
      await expect(job.getState()).resolves.toBe("failed");
    } finally {
      await processor.shutdown();
    }
  });

  it("recovers a persisted retry after the first worker stops", async () => {
    const recoveryQueue = new Queue("WORKER_RECOVERY_QUEUE", { connection });
    const recoveryEvents = new QueueEvents("WORKER_RECOVERY_QUEUE", {
      connection,
    });
    await Promise.all([
      recoveryQueue.waitUntilReady(),
      recoveryEvents.waitUntilReady(),
      recoveryQueue.obliterate({ force: true }),
    ]);

    let firstAttempt!: () => void;
    const firstAttemptStarted = new Promise<void>((resolve) => {
      firstAttempt = resolve;
    });
    const firstWorker = new Worker(
      "WORKER_RECOVERY_QUEUE",
      async () => {
        firstAttempt();
        await Promise.resolve();
        throw new Error("worker stopped before completion");
      },
      {
        connection,
      },
    );
    const job = await recoveryQueue.add(
      "recover",
      { operationId: "recovery-a" },
      { attempts: 3 },
    );
    await firstAttemptStarted;
    await new Promise<void>((resolve) =>
      firstWorker.once("failed", () => resolve()),
    );
    await firstWorker.close();

    let recovered = 0;
    const stalled = new Promise<void>((resolve) => {
      recoveryEvents.once("completed", () => resolve());
    });
    const secondWorker = new Worker(
      "WORKER_RECOVERY_QUEUE",
      async () => {
        recovered += 1;
        await Promise.resolve();
      },
      {
        connection,
      },
    );
    await stalled;

    await expect(
      job.waitUntilFinished(recoveryEvents, 10000),
    ).resolves.toBeNull();
    expect(recovered).toBe(1);
    await secondWorker.close();
    await recoveryEvents.close();
    await recoveryQueue.close();
  });

  it("executes a duplicate logical job only once at the business callback", async () => {
    const duplicateQueue = new Queue("WORKER_DUPLICATE_QUEUE", { connection });
    const duplicateEvents = new QueueEvents("WORKER_DUPLICATE_QUEUE", {
      connection,
    });
    await Promise.all([
      duplicateQueue.waitUntilReady(),
      duplicateEvents.waitUntilReady(),
      duplicateQueue.obliterate({ force: true }),
    ]);

    let sideEffects = 0;
    const worker = new Worker(
      "WORKER_DUPLICATE_QUEUE",
      async () => {
        sideEffects += 1;
        await Promise.resolve();
      },
      { connection },
    );
    const options = { jobId: "logical-operation-a" };
    const first = await duplicateQueue.add(
      "duplicate",
      { tenantId: "tenant-a" },
      options,
    );
    const second = await duplicateQueue.add(
      "duplicate",
      { tenantId: "tenant-a" },
      options,
    );

    await expect(
      first.waitUntilFinished(duplicateEvents, 10000),
    ).resolves.toBeNull();
    expect(second.id).toBe(first.id);
    expect(sideEffects).toBe(1);

    await worker.close();
    await duplicateEvents.close();
    await duplicateQueue.close();
  });
});
