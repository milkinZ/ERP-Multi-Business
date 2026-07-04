import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';

import { SupplierController } from './supplier.controller';
import { SupplierService } from './supplier.service';
import { SupplierRepository } from './supplier.repository';

@Module({
  imports: [PrismaModule],
  controllers: [SupplierController],
  providers: [SupplierService, SupplierRepository],
})
export class SupplierModule {}
