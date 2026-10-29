import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CsrfRefreshGuard } from './csrf-refresh.guard';
import { PlatformCsrfGuard } from './platform-csrf.guard';
import { ThrottlerAppModule } from './throttler.module';
import { ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [ConfigModule, ThrottlerAppModule],

  providers: [
    CsrfRefreshGuard,
    PlatformCsrfGuard,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [CsrfRefreshGuard, PlatformCsrfGuard],
})
export class SecurityModule {}
