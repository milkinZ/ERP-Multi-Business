import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { PrismaService } from '../../../core/database/prisma.service';
import { QueueService } from '../../queue/queue.service';
import { MetricsModule } from '../metrics/metrics.module';
import { MetricsService } from '../metrics/metrics.service';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [MetricsModule, RedisModule],
  controllers: [AdminController],
  providers: [PrismaService, QueueService, MetricsService],
})
export class AdminModule {}
