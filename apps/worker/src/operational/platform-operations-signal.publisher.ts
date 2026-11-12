import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

import { RedisService } from "../shared/redis.service";

const PLATFORM_OPERATIONS_SIGNAL_CHANNEL = "platform:operations:refresh";

@Injectable()
export class PlatformOperationsSignalPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(PlatformOperationsSignalPublisher.name);
  private readonly publisher: Redis;

  constructor(redis: RedisService) {
    this.publisher = new Redis(redis.getConnectionOptions());
    this.publisher.on("error", (error) => {
      this.logger.error(`Platform signal Redis error: ${error.name}`);
    });
  }

  async publishRefresh(): Promise<void> {
    try {
      await this.publisher.publish(
        PLATFORM_OPERATIONS_SIGNAL_CHANNEL,
        "refresh",
      );
    } catch (error) {
      this.logger.warn(
        `Could not publish platform operations update: ${error instanceof Error ? error.name : "UnknownError"}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.publisher.status === "ready") {
      await this.publisher.quit();
      return;
    }
    this.publisher.disconnect();
  }
}
