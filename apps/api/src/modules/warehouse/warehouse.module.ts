import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';

import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';
import { WarehouseRepository } from './warehouse.repository';
import { FeatureFlagsModule } from '../feature-flags/feature-flag.module';

@Module({
  imports: [PrismaModule, FeatureFlagsModule],
  controllers: [WarehouseController],
  providers: [WarehouseService, WarehouseRepository],
})
export class WarehouseModule {}
