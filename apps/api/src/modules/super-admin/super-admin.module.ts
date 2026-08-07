import { Module } from '@nestjs/common';

import { PrismaModule } from '../../core/database/prisma.module';
import { DomainEventsModule } from '../../core/events/domain-events.module';
import { OutboxModule } from '../../infrastructure/events/outbox.module';

import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminRepository } from './super-admin.repository';

@Module({
  imports: [PrismaModule, DomainEventsModule, OutboxModule],
  controllers: [SuperAdminController],
  providers: [SuperAdminService, SuperAdminRepository],
  exports: [SuperAdminService, SuperAdminRepository],
})
export class SuperAdminModule {}
