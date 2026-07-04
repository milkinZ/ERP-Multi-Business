import { Module } from "@nestjs/common";

import { RedisModule } from "../shared/redis.module";
import { QueueService } from "./queue.service";

@Module({
  imports: [RedisModule],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
