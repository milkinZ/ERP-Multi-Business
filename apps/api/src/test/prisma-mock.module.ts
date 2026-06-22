import { Global, Module } from '@nestjs/common';

import { PrismaService } from '../core/database/prisma.service';

/**
 * Jest unit-test helper.
 *
 * Existing controller/service specs compile without importing PrismaModule.
 * To prevent DI failures, we provide a minimal PrismaService mock.
 */
@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useValue: {},
    },
  ],
  exports: [PrismaService],
})
export class PrismaMockModule {}
