import { Module } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';

import { TenantContextModule } from '../tenants/tenant-context.module';
import { TenantContextService } from '../tenants/tenant-context.service';

import { OutletsController } from './outlets.controller';
import { OutletsService } from './outlets.service';

@Module({
  imports: [TenantContextModule],
  controllers: [OutletsController],
  providers: [OutletsService, PrismaService, TenantContextService],
})
export class OutletsModule {}
