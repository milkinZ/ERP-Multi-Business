import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { OperationalTelemetryQueryDto } from './dto/operational-telemetry-query.dto';
import { OperationalTelemetryService } from './operational-telemetry.service';

type MetricUpsertCall = {
  create: {
    method: string;
    route: string;
    statusClass: string;
    bucketStart: Date;
    requestCount: number;
    errorCount: number;
    durationTotalMs: number;
  };
};

type EventCreateManyCall = {
  data: Array<{
    level: string;
    eventType: string;
    method: string;
    route: string;
    statusCode: number;
    durationMs: number;
  }>;
};

describe('OperationalTelemetryService', () => {
  const metricUpsert = jest.fn();
  const metricGroupBy = jest.fn();
  const metricDeleteMany = jest.fn();
  const eventCreateMany = jest.fn();
  const eventFindMany = jest.fn();
  const eventDeleteMany = jest.fn();
  const transaction = jest.fn();
  const prisma = {
    $transaction: transaction,
    operationalMetricBucket: {
      upsert: metricUpsert,
      groupBy: metricGroupBy,
      deleteMany: metricDeleteMany,
    },
    operationalEventLog: {
      createMany: eventCreateMany,
      findMany: eventFindMany,
      deleteMany: eventDeleteMany,
    },
  } as unknown as PrismaService;
  let service: OperationalTelemetryService;

  beforeEach(() => {
    jest.clearAllMocks();
    metricUpsert.mockResolvedValue({});
    metricGroupBy.mockResolvedValue([]);
    metricDeleteMany.mockResolvedValue({ count: 0 });
    eventCreateMany.mockResolvedValue({ count: 0 });
    eventFindMany.mockResolvedValue([]);
    eventDeleteMany.mockResolvedValue({ count: 0 });
    transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
    service = new OperationalTelemetryService(prisma);
  });

  it('persists aggregated requests and sanitized error summaries', async () => {
    service.recordHttpRequest('get', '/orders/:id', 200, 25);
    service.recordHttpRequest('get', '/orders/:id', 500, 75);
    service.recordHttpRequest('POST', '/orders/../private?token=x', 500, 80);

    await service.flush();

    expect(metricUpsert).toHaveBeenCalledTimes(3);
    const metricCalls = metricUpsert.mock.calls as Array<[MetricUpsertCall]>;
    expect(
      metricCalls.map(([call]) => ({
        method: call.create.method,
        route: call.create.route,
        statusClass: call.create.statusClass,
        requestCount: call.create.requestCount,
        errorCount: call.create.errorCount,
        durationTotalMs: call.create.durationTotalMs,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          method: 'GET',
          route: '/orders/:id',
          statusClass: '2xx',
          requestCount: 1,
          errorCount: 0,
          durationTotalMs: 25,
        },
        {
          method: 'GET',
          route: '/orders/:id',
          statusClass: '5xx',
          requestCount: 1,
          errorCount: 1,
          durationTotalMs: 75,
        },
      ]),
    );
    const eventCalls = eventCreateMany.mock.calls as Array<
      [EventCreateManyCall]
    >;
    expect(eventCreateMany).toHaveBeenCalledWith({
      data: [
        {
          level: 'ERROR',
          eventType: 'HTTP_REQUEST_ERROR',
          method: 'GET',
          route: '/orders/:id',
          statusCode: 500,
          durationMs: 75,
        },
        {
          level: 'ERROR',
          eventType: 'HTTP_REQUEST_ERROR',
          method: 'POST',
          route: 'unmatched',
          statusCode: 500,
          durationMs: 80,
        },
      ],
    });
    expect(JSON.stringify(eventCalls)).not.toContain('token=x');
  });

  it('rejects invalid or overlong historical ranges', async () => {
    const query = new OperationalTelemetryQueryDto();
    query.from = '2026-01-01T00:00:00.000Z';
    query.to = '2026-02-15T00:00:00.000Z';

    await expect(service.getHistoricalTelemetry(query)).rejects.toThrow(
      BadRequestException,
    );
    expect(metricGroupBy).not.toHaveBeenCalled();
    expect(eventFindMany).not.toHaveBeenCalled();
  });

  it('retains failed batches for a later flush without persisting error details', async () => {
    service.recordHttpRequest('GET', '/orders/:id', 500, 30);
    transaction.mockRejectedValueOnce(new Error('database connection details'));
    eventCreateMany.mockRejectedValueOnce(
      new Error('database connection details'),
    );

    await service.flush();
    await service.flush();

    expect(metricUpsert).toHaveBeenCalledTimes(2);
    expect(eventCreateMany).toHaveBeenCalledTimes(2);
    const eventCalls = eventCreateMany.mock.calls as Array<
      [EventCreateManyCall]
    >;
    expect(eventCalls[1][0].data).toEqual([
      {
        level: 'ERROR',
        eventType: 'HTTP_REQUEST_ERROR',
        method: 'GET',
        route: '/orders/:id',
        statusCode: 500,
        durationMs: 30,
      },
    ]);
    expect(JSON.stringify(eventCalls)).not.toContain(
      'database connection details',
    );
  });

  it('returns bounded aggregates and redacted event fields', async () => {
    metricGroupBy.mockResolvedValue([
      {
        method: 'GET',
        route: '/orders/:id',
        statusClass: '5xx',
        _sum: { requestCount: 4, errorCount: 2, durationTotalMs: 800 },
      },
    ]);
    const query = new OperationalTelemetryQueryDto();
    query.take = 5;

    const result = await service.getHistoricalTelemetry(query);

    const metricQueries = metricGroupBy.mock.calls as Array<
      [{ take: number; by: string[] }]
    >;
    expect(metricQueries[0][0]).toMatchObject({
      take: 100,
      by: ['method', 'route', 'statusClass'],
    });
    const eventQueries = eventFindMany.mock.calls as Array<
      [{ take: number; select: { route: boolean; statusCode: boolean } }]
    >;
    expect(eventQueries[0][0].take).toBe(5);
    expect(eventQueries[0][0].select).toMatchObject({
      route: true,
      statusCode: true,
    });
    expect(result.metrics).toEqual([
      {
        method: 'GET',
        route: '/orders/:id',
        statusClass: '5xx',
        requestCount: 4,
        errorCount: 2,
        durationTotalMs: 800,
      },
    ]);
    expect(result.retentionDays).toBe(30);
  });

  it('purges logs and metric buckets older than 30 days together', async () => {
    await service.purgeExpired();

    expect(transaction).toHaveBeenCalledTimes(1);
    const eventDeleteCalls = eventDeleteMany.mock.calls as Array<
      [{ where: { createdAt: { lt: Date } } }]
    >;
    const metricDeleteCalls = metricDeleteMany.mock.calls as Array<
      [{ where: { bucketStart: { lt: Date } } }]
    >;
    expect(eventDeleteCalls[0][0].where.createdAt.lt).toBeInstanceOf(Date);
    expect(metricDeleteCalls[0][0].where.bucketStart.lt).toBeInstanceOf(Date);
  });
});
