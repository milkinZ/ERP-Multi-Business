import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { FeatureFlagRepository } from './feature-flag.repository';
import { FeatureFlagAggregate } from './domain/feature-flag.aggregate';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { DOMAIN_EVENTS } from '../../core/events/domain-events';
import type {
  FeatureFlagCreatedEvent,
  FeatureFlagEnabledEvent,
  FeatureFlagDisabledEvent,
  FeatureFlagUpdatedEvent,
  FeatureFlagArchivedEvent,
  FeatureFlagRestoredEvent,
} from '../../core/events/domain-events';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger(FeatureFlagService.name);

  constructor(
    private readonly repository: FeatureFlagRepository,
    private readonly domainEventBus: DomainEventBus,
    private readonly redisService: RedisService,
  ) {}

  private cacheKey(tenantId: string, key: string): string {
    return `feature-flag:${tenantId}:${key}`;
  }

  private cacheKeyScope(tenantId: string): string {
    return `feature-flag:${tenantId}:*`;
  }

  async create(
    tenantId: string,
    key: string,
    enabled: boolean = false,
    payload?: Record<string, unknown>,
  ): Promise<FeatureFlagAggregate> {
    const exists = await this.repository.existsByKey(key, tenantId);
    if (exists) {
      throw new ConflictException(
        `Feature flag with key "${key}" already exists for this tenant`,
      );
    }

    const id = uuidv4();
    const aggregate = FeatureFlagAggregate.create(
      id,
      key,
      tenantId,
      enabled,
      payload,
    );

    await this.repository.save(aggregate);

    const event: FeatureFlagCreatedEvent = {
      type: DOMAIN_EVENTS.FEATURE_FLAG_CREATED,
      payload: {
        featureFlagId: id,
        key,
        tenantId,
        enabled,
      },
    };
    await this.domainEventBus.publish(event);

    await this.invalidateCache(tenantId, key);

    return aggregate;
  }

  async findById(id: string, tenantId: string): Promise<FeatureFlagAggregate> {
    const aggregate = await this.repository.findById(id, tenantId);
    if (!aggregate) {
      throw new NotFoundException(`Feature flag with id "${id}" not found`);
    }
    return aggregate;
  }

  async findByKey(
    key: string,
    tenantId: string,
  ): Promise<FeatureFlagAggregate> {
    const aggregate = await this.repository.findByKey(key, tenantId);
    if (!aggregate) {
      throw new NotFoundException(`Feature flag with key "${key}" not found`);
    }
    return aggregate;
  }

  async findAll(
    tenantId: string,
    options?: {
      page?: number;
      limit?: number;
      search?: string;
      includeArchived?: boolean;
    },
  ) {
    return this.repository.findAll(tenantId, options);
  }

  async enable(id: string, tenantId: string): Promise<FeatureFlagAggregate> {
    const aggregate = await this.findById(id, tenantId);
    aggregate.enable();

    await this.repository.save(aggregate);

    const event: FeatureFlagEnabledEvent = {
      type: DOMAIN_EVENTS.FEATURE_FLAG_ENABLED,
      payload: {
        featureFlagId: id,
        key: aggregate.getKey(),
        tenantId,
      },
    };
    await this.domainEventBus.publish(event);

    await this.invalidateCache(tenantId, aggregate.getKey());

    return aggregate;
  }

  async disable(id: string, tenantId: string): Promise<FeatureFlagAggregate> {
    const aggregate = await this.findById(id, tenantId);
    aggregate.disable();

    await this.repository.save(aggregate);

    const event: FeatureFlagDisabledEvent = {
      type: DOMAIN_EVENTS.FEATURE_FLAG_DISABLED,
      payload: {
        featureFlagId: id,
        key: aggregate.getKey(),
        tenantId,
      },
    };
    await this.domainEventBus.publish(event);

    await this.invalidateCache(tenantId, aggregate.getKey());

    return aggregate;
  }

  async update(
    id: string,
    tenantId: string,
    updates: { enabled?: boolean; payload?: Record<string, unknown> },
  ): Promise<FeatureFlagAggregate> {
    const aggregate = await this.findById(id, tenantId);
    const changes: string[] = [];

    if (updates.enabled !== undefined) {
      if (updates.enabled) {
        aggregate.enable();
      } else {
        aggregate.disable();
      }
      changes.push('enabled');
    }

    if (updates.payload !== undefined) {
      changes.push('payload');
    }

    await this.repository.save(aggregate);

    const event: FeatureFlagUpdatedEvent = {
      type: DOMAIN_EVENTS.FEATURE_FLAG_UPDATED,
      payload: {
        featureFlagId: id,
        key: aggregate.getKey(),
        tenantId,
        changes,
      },
    };
    await this.domainEventBus.publish(event);

    await this.invalidateCache(tenantId, aggregate.getKey());

    return aggregate;
  }

  async archive(id: string, tenantId: string): Promise<void> {
    const aggregate = await this.findById(id, tenantId);
    aggregate.archive();

    await this.repository.save(aggregate);

    const event: FeatureFlagArchivedEvent = {
      type: DOMAIN_EVENTS.FEATURE_FLAG_ARCHIVED,
      payload: {
        featureFlagId: id,
        key: aggregate.getKey(),
        tenantId,
      },
    };
    await this.domainEventBus.publish(event);

    await this.invalidateCache(tenantId, aggregate.getKey());
  }

  async restore(id: string, tenantId: string): Promise<FeatureFlagAggregate> {
    const aggregate = await this.repository.findByIdIncludingArchived(
      id,
      tenantId,
    );
    if (!aggregate) {
      throw new NotFoundException(`Feature flag with id "${id}" not found`);
    }
    aggregate.restore();

    await this.repository.save(aggregate);

    const event: FeatureFlagRestoredEvent = {
      type: DOMAIN_EVENTS.FEATURE_FLAG_RESTORED,
      payload: {
        featureFlagId: id,
        key: aggregate.getKey(),
        tenantId,
      },
    };
    await this.domainEventBus.publish(event);

    await this.invalidateCache(tenantId, aggregate.getKey());

    return aggregate;
  }

  async evaluate(
    tenantId: string,
    key: string,
    context?: {
      outletId?: string | null;
      userId?: string;
    },
    payload?: Record<string, unknown>,
  ): Promise<boolean> {
    const cacheKey = this.cacheKey(tenantId, key);

    // 1. Try Redis cache
    try {
      const cached: string | null = await this.redisService
        .getClient()
        .get(cacheKey);

      if (cached !== null) {
        return cached === 'true';
      }
    } catch {
      this.logger.warn(`Redis cache read failed for feature flag "${key}"`);
    }

    // 2. Fallback to database
    try {
      const aggregate = await this.repository.findByKey(key, tenantId);

      if (!aggregate) {
        return false;
      }

      const result = aggregate.evaluate(
        {
          tenantId,
          outletId: context?.outletId,
          userId: context?.userId,
        },
        payload,
      );

      // 3. Cache result
      try {
        await this.redisService
          .getClient()
          .setex(cacheKey, 300, result.toString());
      } catch {
        this.logger.warn(`Redis cache write failed for feature flag "${key}"`);
      }

      return result;
    } catch {
      this.logger.error(
        `Failed to evaluate feature flag "${key}" for tenant "${tenantId}"`,
      );

      // Safe default
      return false;
    }
  }

  private async invalidateCache(tenantId: string, key: string): Promise<void> {
    try {
      await this.redisService.getClient().del(this.cacheKey(tenantId, key));
    } catch {
      this.logger.warn(
        `Redis cache invalidation failed for feature flag "${key}"`,
      );
    }
  }

  async hardDelete(id: string, tenantId: string): Promise<void> {
    await this.repository.hardDelete(id, tenantId);
    // No event for hard delete - it's a maintenance operation
  }
}
