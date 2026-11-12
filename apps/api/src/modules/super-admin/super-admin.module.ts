import { Module } from '@nestjs/common';

import { PrismaModule } from '../../core/database/prisma.module';
import { OutboxModule } from '../../infrastructure/events/outbox.module';
import { AuditLogModule } from '../audit-logs/audit-log.module';

import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminRepository } from './super-admin.repository';
import { PlatformSettingsService } from './platform-settings.service';
import { BillingModule } from '../billing/billing.module';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { EmailService } from '../../infrastructure/email/email.service';

@Module({
  imports: [PrismaModule, OutboxModule, AuditLogModule, BillingModule],
  controllers: [SuperAdminController],
  providers: [
    SuperAdminService,
    SuperAdminRepository,
    PlatformSettingsService,
    TenantProvisioningService,
    EmailService,
  ],
  exports: [SuperAdminService, SuperAdminRepository],
})
export class SuperAdminModule {}
