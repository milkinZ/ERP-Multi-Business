import { Module } from '@nestjs/common';

import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantsRepository } from './tenants.repository';

import { TenantContextModule } from './tenant-context.module';

@Module({
  imports: [TenantContextModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantsRepository],
  exports: [],
})
export class TenantsModule {}
