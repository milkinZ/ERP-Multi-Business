import { QUEUE_NAMES, type QueueName } from '../../queue/queue.constants';
import { QueueMonitorService } from './queue-monitor.service';

describe('QueueMonitorService', () => {
  it('returns bounded failed-job metadata without exposing job payload or errors', async () => {
    const queueNames = Object.values(QUEUE_NAMES) as QueueName[];
    const queue = {
      getFailed: jest.fn().mockResolvedValue([
        {
          id: 'private-job-id',
          name: 'sync-job',
          timestamp: 1_700_000_000_000,
          finishedOn: 1_700_000_005_000,
          attemptsMade: 2,
          opts: { attempts: 3 },
          data: { secret: 'private-payload' },
          failedReason: 'private error',
        },
      ]),
    };
    const queueService = { getQueue: jest.fn().mockReturnValue(queue) };
    const service = new QueueMonitorService(queueService as never, {} as never);

    const summaries = await service.getFailedJobSummaries();

    expect(summaries).toHaveLength(queueNames.length);
    expect(summaries[0]).toEqual({
      queueName: queueNames[0],
      jobName: 'sync-job',
      failedAt: new Date(1_700_000_005_000),
      attemptsMade: 2,
      maxAttempts: 3,
    });
    expect(queue.getFailed).toHaveBeenCalledWith(0, 9);
    expect(summaries[0]).not.toHaveProperty('id');
    expect(summaries[0]).not.toHaveProperty('data');
    expect(summaries[0]).not.toHaveProperty('failedReason');
  });
});
