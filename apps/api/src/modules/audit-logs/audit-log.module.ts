import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { DomainEventsModule } from '../../core/events/domain-events.module';
import { AuditLogService } from './audit-log.service';
import { AuditLogController } from './audit-log.controller';
import { PlatformAuditLogService } from './platform-audit-log.service';

@Module({
  imports: [PrismaModule, DomainEventsModule],
  controllers: [AuditLogController],
  providers: [AuditLogService, PlatformAuditLogService],
  exports: [AuditLogService, PlatformAuditLogService],
})
export class AuditLogModule {}
