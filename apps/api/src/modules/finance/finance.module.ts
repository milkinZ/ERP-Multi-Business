import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { AccountingService } from './accounting.service';
import { FinanceController } from './finance.controller';
import { SupplierApController } from './supplier-ap.controller';
import { SupplierApService } from './supplier-ap.service';
import { FeatureFlagsModule } from '../feature-flags/feature-flag.module';

@Module({
  imports: [PrismaModule, FeatureFlagsModule],
  controllers: [FinanceController, SupplierApController],
  providers: [AccountingService, SupplierApService],
  exports: [AccountingService],
})
export class FinanceModule {}
