import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { DomainEventsModule } from '../../core/events/domain-events.module';
import { AuditLogService } from './audit-log.service';
import { AuditLogController } from './audit-log.controller';

@Module({
  imports: [PrismaModule, DomainEventsModule],
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
