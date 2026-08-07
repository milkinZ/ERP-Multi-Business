import { Module } from '@nestjs/common';

import { PrismaModule } from '../../core/database/prisma.module';
import { TenantContextModule } from '../tenants/tenant-context.module';

import { BusinessRegistryController } from './business-registry.controller';
import { BusinessRegistryService } from './business-registry.service';
import { BusinessRegistryRepository } from './business-registry.repository';

@Module({
  imports: [PrismaModule, TenantContextModule],
  controllers: [BusinessRegistryController],
  providers: [BusinessRegistryService, BusinessRegistryRepository],
  exports: [BusinessRegistryService, BusinessRegistryRepository],
})
export class BusinessRegistryModule {}
