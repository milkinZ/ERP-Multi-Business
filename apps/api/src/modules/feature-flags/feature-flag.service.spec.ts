import { ConflictException } from '@nestjs/common';

import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { testIds } from '../../test/factories';
import { FeatureFlagAggregate } from './domain/feature-flag.aggregate';
import { FeatureFlagRepository } from './feature-flag.repository';
import { FeatureFlagService } from './feature-flag.service';

describe('FeatureFlagService', () => {
  const repository = {
    existsByKey: jest.fn(),
    save: jest.fn(),
    findById: jest.fn(),
    findByIdIncludingArchived: jest.fn(),
    findByKey: jest.fn(),
  } as unknown as FeatureFlagRepository;
  const eventBusPublish = jest.fn();
  const eventBus = {
    publish: eventBusPublish,
  } as unknown as DomainEventBus;
  const client: {
    get: jest.Mock;
    setex: jest.Mock;
    del: jest.Mock;
  } = { get: jest.fn(), setex: jest.fn(), del: jest.fn() };
  const redis = { getClient: jest.fn(() => client) } as unknown as RedisService;
  let service: FeatureFlagService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FeatureFlagService(repository, eventBus, redis);
  });

  it('rejects duplicate keys within the trusted tenant scope', async () => {
    repository.existsByKey = jest.fn().mockResolvedValue(true);

    await expect(
      service.create(testIds.tenant, 'inventory-v2'),
    ).rejects.toThrow(ConflictException);
  });

  it('uses a tenant-scoped cache key and never queries another tenant on a cache miss', async () => {
    client.get.mockResolvedValue(null);
    client.setex.mockResolvedValue('OK');
    const flag = FeatureFlagAggregate.create(
      testIds.featureFlag,
      'inventory-v2',
      testIds.tenant,
      true,
    );
    const findByKeyMock = jest.fn().mockResolvedValue(flag);
    repository.findByKey = findByKeyMock;

    await expect(
      service.evaluate(testIds.tenant, 'inventory-v2'),
    ).resolves.toBe(true);
    expect(findByKeyMock).toHaveBeenCalledWith('inventory-v2', testIds.tenant);
    expect(client.get).toHaveBeenCalledWith(
      'feature-flag:tenant-a:inventory-v2',
    );
    expect(client.setex).toHaveBeenCalledWith(
      'feature-flag:tenant-a:inventory-v2',
      300,
      'true',
    );
  });

  it('fails closed when Redis and the repository are unavailable', async () => {
    client.get.mockRejectedValue(new Error('redis unavailable'));
    repository.findByKey = jest
      .fn()
      .mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.evaluate(testIds.tenant, 'inventory-v2'),
    ).resolves.toBe(false);
  });

  it('publishes a tenant-scoped event and invalidates only that tenant cache on enable', async () => {
    const flag = FeatureFlagAggregate.create(
      testIds.featureFlag,
      'inventory-v2',
      testIds.tenant,
      false,
    );
    const findByIdMock = jest.fn() as jest.MockedFunction<
      FeatureFlagRepository['findById']
    >;
    findByIdMock.mockResolvedValue(flag);
    const saveMock = jest.fn() as jest.MockedFunction<
      FeatureFlagRepository['save']
    >;
    saveMock.mockResolvedValue(undefined);
    (repository as Partial<FeatureFlagRepository>).findById = findByIdMock;
    (repository as Partial<FeatureFlagRepository>).save = saveMock;
    eventBusPublish.mockResolvedValue(undefined);
    client.del.mockResolvedValue(1);

    await service.enable(testIds.featureFlag, testIds.tenant);

    expect(findByIdMock).toHaveBeenCalledWith(
      testIds.featureFlag,
      testIds.tenant,
    );
    const expectedPayloadMatcher = expect.objectContaining({
      tenantId: testIds.tenant,
    }) as Record<string, unknown>;

    expect(eventBusPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expectedPayloadMatcher,
      }),
    );
    expect(client.del).toHaveBeenCalledWith(
      'feature-flag:tenant-a:inventory-v2',
    );
  });

  it('restores an archived flag only through a tenant-scoped archived lookup', async () => {
    const flag = FeatureFlagAggregate.create(
      testIds.featureFlag,
      'inventory-v2',
      testIds.tenant,
      true,
    );
    flag.archive();
    const findByIdIncludingArchivedMock = jest.fn() as jest.MockedFunction<
      FeatureFlagRepository['findByIdIncludingArchived']
    >;
    findByIdIncludingArchivedMock.mockResolvedValue(flag);
    const saveMock = jest.fn() as jest.MockedFunction<
      FeatureFlagRepository['save']
    >;
    saveMock.mockResolvedValue(undefined);
    (repository as Partial<FeatureFlagRepository>).findByIdIncludingArchived =
      findByIdIncludingArchivedMock;
    (repository as Partial<FeatureFlagRepository>).save = saveMock;
    client.del.mockResolvedValue(1);

    await expect(
      service.restore(testIds.featureFlag, testIds.tenant),
    ).resolves.toBe(flag);
    expect(findByIdIncludingArchivedMock).toHaveBeenCalledWith(
      testIds.featureFlag,
      testIds.tenant,
    );
    expect(flag.isDeleted()).toBe(false);
  });
});
