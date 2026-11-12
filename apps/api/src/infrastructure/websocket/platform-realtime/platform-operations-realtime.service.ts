import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

import { RedisService } from '../../redis/redis.service';
import { PlatformOperationsRealtimeGateway } from './platform-operations-realtime.gateway';

export const PLATFORM_OPERATIONS_SIGNAL_CHANNEL = 'platform:operations:refresh';

@Injectable()
export class PlatformOperationsRealtimeService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PlatformOperationsRealtimeService.name);
  private subscriber?: Redis;

  constructor(
    private readonly redis: RedisService,
    private readonly gateway: PlatformOperationsRealtimeGateway,
  ) {}

  onModuleInit(): void {
    this.subscriber = this.redis.redis.duplicate();
    this.subscriber.on('error', (error) => {
      this.logger.error(
        `Platform realtime Redis subscriber error: ${error.name}`,
      );
    });
    this.subscriber.on('message', (channel, message) => {
      if (
        channel === PLATFORM_OPERATIONS_SIGNAL_CHANNEL &&
        message === 'refresh'
      ) {
        this.gateway.emitUpdate();
      }
    });
    void this.subscriber
      .subscribe(PLATFORM_OPERATIONS_SIGNAL_CHANNEL)
      .catch((error: unknown) => {
        this.logger.warn(
          `Could not subscribe to platform realtime signals: ${error instanceof Error ? error.name : 'UnknownError'}`,
        );
      });
  }

  async publishRefresh(): Promise<void> {
    try {
      await this.redis.redis.publish(
        PLATFORM_OPERATIONS_SIGNAL_CHANNEL,
        'refresh',
      );
    } catch (error) {
      this.logger.warn(
        `Could not publish platform realtime update: ${error instanceof Error ? error.name : 'UnknownError'}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    const subscriber = this.subscriber;
    this.subscriber = undefined;
    if (!subscriber) return;
    if (subscriber.status === 'ready') {
      await subscriber.quit();
      return;
    }
    subscriber.disconnect();
  }
}
