import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CsrfRefreshGuard } from './csrf-refresh.guard';
import { ThrottlerAppModule } from './throttler.module';
import { ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [ConfigModule, ThrottlerAppModule],

  providers: [
    CsrfRefreshGuard,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [CsrfRefreshGuard],
})
export class SecurityModule {}
