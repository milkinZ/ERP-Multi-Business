import { Module } from '@nestjs/common';

import { PrismaModule } from '../../core/database/prisma.module';
import { OutboxModule } from '../../infrastructure/events/outbox.module';
import { AuditLogModule } from '../audit-logs/audit-log.module';

import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminRepository } from './super-admin.repository';
import { PlatformSettingsService } from './platform-settings.service';

@Module({
  imports: [PrismaModule, OutboxModule, AuditLogModule],
  controllers: [SuperAdminController],
  providers: [SuperAdminService, SuperAdminRepository, PlatformSettingsService],
  exports: [SuperAdminService, SuperAdminRepository],
})
export class SuperAdminModule {}
