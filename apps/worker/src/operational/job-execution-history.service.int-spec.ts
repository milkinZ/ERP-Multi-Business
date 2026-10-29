import { Queue, QueueEvents, Worker } from "bullmq";
import { randomUUID } from "node:crypto";

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
    jobName: string,
    predicate: (
      rows: Awaited<ReturnType<typeof prisma.jobExecution.findMany>>,
    ) => boolean,
  ) {
    const deadline = Date.now() + 10_000;

    while (Date.now() < deadline) {
      const rows = await prisma.jobExecution.findMany({
        where: { queueName, jobName },
        orderBy: { createdAt: "asc" },
      });

      if (predicate(rows)) {
        return rows;
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return prisma.jobExecution.findMany({
      where: { queueName, jobName },
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

    history = new JobExecutionHistoryService(
      prisma,
      new RedisService(),
      registry,
    );
    history.onModuleInit();
  });

  afterAll(async () => {
    if (history) {
      await history.onModuleDestroy();
    }
    await prisma.$disconnect();
  });

  it("records a successful job execution and associates it with the current worker", async () => {
    const queueName = QUEUE_NAMES.ORDER_QUEUE;
    const jobName = `job-history-success-${randomUUID()}`;
    const queue = new Queue(queueName, { connection });
    const events = new QueueEvents(queueName, { connection });
    await Promise.all([queue.waitUntilReady(), events.waitUntilReady()]);

    const worker = new Worker(
      queueName,
      async () => {
        await Promise.resolve();
      },
      { connection },
    );

    try {
      const job = await queue.add(
        jobName,
        { tenantId: "tenant-a" },
        { attempts: 2, backoff: { type: "fixed", delay: 10 } },
      );

      await expect(job.waitUntilFinished(events, 15000)).resolves.toBeNull();

      const rows = await waitForRows(queueName, jobName, (records) =>
        records.some((row) => row.status === "COMPLETED"),
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        jobName,
        status: "COMPLETED",
        attemptNumber: 1,
      });
      expect(rows[0]?.workerId).toBeTruthy();
    } finally {
      await worker.close();
      await events.close();
      await queue.close();
      await prisma.jobExecution.deleteMany({ where: { jobName } });
    }
  }, 30000);

  it("records a retry attempt series with retry and completed states", async () => {
    const queueName = QUEUE_NAMES.ANALYTICS_QUEUE;
    const jobName = `job-history-retry-${randomUUID()}`;
    const queue = new Queue(queueName, { connection });
    const events = new QueueEvents(queueName, { connection });
    await Promise.all([queue.waitUntilReady(), events.waitUntilReady()]);

    let shouldFail = true;
    const worker = new Worker(
      queueName,
      async () => {
        if (shouldFail) {
          shouldFail = false;
          throw new Error("temporary application error");
        }

        await Promise.resolve();
      },
      { connection },
    );

    try {
      const job = await queue.add(
        jobName,
        { tenantId: "tenant-b" },
        { attempts: 3, backoff: { type: "fixed", delay: 10 } },
      );

      await expect(job.waitUntilFinished(events, 20000)).resolves.toBeNull();

      const rows = await waitForRows(
        queueName,
        jobName,
        (records) =>
          records.some(
            (row) => row.attemptNumber === 2 && row.status === "COMPLETED",
          ) &&
          records.some(
            (row) => row.attemptNumber === 1 && row.status === "RETRYING",
          ),
      );

      expect(rows).toHaveLength(2);
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            jobName,
            attemptNumber: 1,
            status: "RETRYING",
            errorCategory: "APPLICATION_ERROR",
          }),
          expect.objectContaining({
            jobName,
            attemptNumber: 2,
            status: "COMPLETED",
          }),
        ]),
      );
    } finally {
      await worker.close();
      await events.close();
      await queue.close();
      await prisma.jobExecution.deleteMany({ where: { jobName } });
    }
  }, 30000);
});
