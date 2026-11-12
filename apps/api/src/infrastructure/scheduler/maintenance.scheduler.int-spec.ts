import { randomUUID } from 'node:crypto';

import { Test } from '@nestjs/testing';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { OutboxDispatcherService } from '../../core/events/outbox-dispatcher.service';
import { MaintenanceScheduler } from './maintenance.scheduler';
import { AutopayService } from '../../modules/billing/autopay.service';
import { PlatformSchedulerExecutionService } from './platform-scheduler-execution.service';

const prisma = new PrismaClient();
const eventBus = { publish: jest.fn() } as unknown as DomainEventBus;
const dispatcher = new OutboxDispatcherService(prisma as never, eventBus);
const executionHistory = new PlatformSchedulerExecutionService(prisma as never);

const eventType = 'order.created';
const eventPayload = JSON.stringify({
  type: eventType,
  payload: { orderId: 'scheduler-order', tenantId: 'scheduler-tenant' },
});

describe('MaintenanceScheduler integration', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    await prisma.$connect();
    await prisma.outboxEvent.deleteMany({ where: { type: eventType } });
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { type: eventType } });
    await prisma.$disconnect();
  });

  it('executes the registered cron job and dispatches a pending outbox event', async () => {
    const module = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot()],
      providers: [
        MaintenanceScheduler,
        { provide: OutboxDispatcherService, useValue: dispatcher },
        {
          provide: PlatformSchedulerExecutionService,
          useValue: executionHistory,
        },
        {
          provide: AutopayService,
          useValue: { processScheduledAutopay: jest.fn() },
        },
      ],
    }).compile();
    await module.init();
    const scheduler = module.get(MaintenanceScheduler);
    const registry = module.get(SchedulerRegistry);
    const job = registry.getCronJob('outbox-dispatch');
    const autopayJob = registry.getCronJob('subscription-autopay');

    try {
      await prisma.outboxEvent.create({
        data: {
          type: eventType,
          payload: eventPayload,
          status: 'PENDING',
          createdAt: new Date(0),
        },
      });

      expect(job).toBeDefined();
      expect(autopayJob).toBeDefined();
      await scheduler.dispatchOutbox();
      await scheduler.processAutopay();

      await expect(
        prisma.outboxEvent.findFirst({ where: { type: eventType } }),
      ).resolves.toEqual(expect.objectContaining({ status: 'PROCESSED' }));
      expect(scheduler).toBeInstanceOf(MaintenanceScheduler);
    } finally {
      await module.close();
    }
  });

  it('purges scheduler runs and job attempts older than 30 days', async () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000);
    const schedulerRunId = `retention_${randomUUID()}`;
    const bullmqJobId = `retention-${randomUUID()}`;
    try {
      await prisma.$executeRaw`
        INSERT INTO "PlatformSchedulerExecution"
          ("id", "schedulerName", "status", "startedAt", "createdAt", "updatedAt")
        VALUES
          (${schedulerRunId}, 'retention-test', 'SUCCEEDED', ${oldDate}, ${oldDate}, ${oldDate})
      `;
      await prisma.jobExecution.create({
        data: {
          queueName: 'retention-test',
          bullmqJobId,
          status: 'COMPLETED',
          createdAt: oldDate,
          updatedAt: oldDate,
        },
      });

      await executionHistory.purgeExpired();

      const oldSchedulerRuns = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "PlatformSchedulerExecution" WHERE "id" = ${schedulerRunId}
      `;
      const oldJobAttempts = await prisma.jobExecution.findMany({
        where: { queueName: 'retention-test', bullmqJobId },
      });
      expect(oldSchedulerRuns).toHaveLength(0);
      expect(oldJobAttempts).toHaveLength(0);
    } finally {
      await prisma.jobExecution.deleteMany({
        where: { queueName: 'retention-test', bullmqJobId },
      });
      await prisma.$executeRaw`
        DELETE FROM "PlatformSchedulerExecution" WHERE "id" = ${schedulerRunId}
      `;
    }
  });
});
