import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ThrottlerModule } from '@nestjs/throttler';

import { CsrfRefreshGuard } from './csrf-refresh.guard';
import { throttlerOptions } from './throttler-setup';

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRoot(
      throttlerOptions as unknown as import('@nestjs/throttler').ThrottlerModuleOptions,
    ),
  ],

  providers: [CsrfRefreshGuard],
  exports: [CsrfRefreshGuard],
})
export class SecurityModule {}
