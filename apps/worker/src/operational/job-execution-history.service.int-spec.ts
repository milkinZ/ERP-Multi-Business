import { Queue, QueueEvents, Worker } from "bullmq";

import { assertSafeIntegrationEnvironment } from "../../../api/src/test/integration-environment";
import { QUEUE_NAMES } from "../queue/queue.constants";
import { PrismaService } from "../shared/prisma.service";
import { RedisService } from "../shared/redis.service";
import { JobExecutionHistoryService } from "./job-execution-history.service";
import { WorkerRegistryService } from "./worker-registry.service";

describe("JobExecutionHistoryService", () => {
  let prisma: PrismaService;
  let history: JobExecutionHistoryService;
  let registry: WorkerRegistryService;
  const connection = new RedisService().getConnectionOptions();

  async function waitForRows(
    queueName: string,
    predicate: (rows: Awaited<ReturnType<typeof prisma.jobExecution.findMany>>) => boolean,
  ) {
    const deadline = Date.now() + 10_000;

    while (Date.now() < deadline) {
      const rows = await prisma.jobExecution.findMany({
        where: { queueName },
        orderBy: { createdAt: "asc" },
      });

      if (predicate(rows)) {
        return rows;
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return await prisma.jobExecution.findMany({
      where: { queueName },
      orderBy: { createdAt: "asc" },
    });
  }

  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    prisma = new PrismaService();
    await prisma.$connect();

    registry = new WorkerRegistryService(prisma, {
      workerName: "job-history-int-test",
    });
    await registry.registerWorker();

    history = new JobExecutionHistoryService(prisma, new RedisService(), registry);
    await history.onModuleInit();
  });

  afterAll(async () => {
    if (history) {
      await history.onModuleDestroy();
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.jobExecution.deleteMany();
  });

  it("records a successful job execution and associates it with the current worker", async () => {
    const queueName = QUEUE_NAMES.ORDER_QUEUE;
    const queue = new Queue(queueName, { connection });
    const events = new QueueEvents(queueName, { connection });
    await Promise.all([queue.waitUntilReady(), events.waitUntilReady()]);
    await queue.obliterate({ force: true });

    const worker = new Worker(
      queueName,
      async () => {
        await Promise.resolve();
      },
      { connection },
    );

    try {
      const job = await queue.add(
        "job-history-success",
        { tenantId: "tenant-a" },
        { attempts: 2, backoff: { type: "fixed", delay: 10 } },
      );

      await expect(job.waitUntilFinished(events, 15000)).resolves.toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const rows = await waitForRows(
        queueName,
        (records) => records.some((row) => row.status === "COMPLETED"),
      );

      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.some((row) => row.status === "COMPLETED")).toBe(true);
      expect(rows.some((row) => row.jobName === "job-history-success")).toBe(true);
      expect(rows.some((row) => row.attemptNumber === 1)).toBe(true);
      expect(rows.some((row) => !!row.workerId)).toBe(true);
    } finally {
      await worker.close();
      await events.close();
      await queue.close();
    }
  }, 30000);

  it("records a retry attempt series with retry and completed states", async () => {
    const queueName = QUEUE_NAMES.ANALYTICS_QUEUE;
    const queue = new Queue(queueName, { connection });
    const events = new QueueEvents(queueName, { connection });
    await Promise.all([queue.waitUntilReady(), events.waitUntilReady()]);
    await queue.obliterate({ force: true });

    let shouldFail = true;
    const worker = new Worker(
      queueName,
      async () => {
        if (shouldFail) {
          shouldFail = false;
          throw new Error("temporary failure");
        }

        await Promise.resolve();
      },
      { connection },
    );

    try {
      const job = await queue.add(
        "job-history-retry",
        { tenantId: "tenant-b" },
        { attempts: 3, backoff: { type: "fixed", delay: 10 } },
      );

      await expect(job.waitUntilFinished(events, 20000)).resolves.toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const rows = await waitForRows(
        queueName,
        (records) => records.some((row) => row.status === "COMPLETED"),
      );

      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.some((row) => row.jobName === "job-history-retry")).toBe(true);
      expect(rows.some((row) => row.status === "ACTIVE")).toBe(true);
      expect(rows.some((row) => row.status === "COMPLETED")).toBe(true);
    } finally {
      await worker.close();
      await events.close();
      await queue.close();
    }
  }, 30000);
});
