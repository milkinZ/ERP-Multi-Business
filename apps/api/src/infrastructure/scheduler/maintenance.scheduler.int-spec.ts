import { Test } from '@nestjs/testing';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { OutboxDispatcherService } from '../../core/events/outbox-dispatcher.service';
import { MaintenanceScheduler } from './maintenance.scheduler';

const prisma = new PrismaClient();
const eventBus = { publish: jest.fn() } as unknown as DomainEventBus;
const dispatcher = new OutboxDispatcherService(prisma as never, eventBus);

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
      ],
    }).compile();
    await module.init();
    const scheduler = module.get(MaintenanceScheduler);
    const registry = module.get(SchedulerRegistry);
    const job = registry.getCronJob('outbox-dispatch');

    await prisma.outboxEvent.create({
      data: { type: eventType, payload: eventPayload, status: 'PENDING' },
    });

    await job.fireOnTick();

    await expect(
      prisma.outboxEvent.findFirst({ where: { type: eventType } }),
    ).resolves.toEqual(expect.objectContaining({ status: 'PROCESSED' }));
    expect(scheduler).toBeInstanceOf(MaintenanceScheduler);
    await module.close();
  });
});
