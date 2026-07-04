import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { throttlerOptions } from './throttler-setup';
import { ConfigModule } from '@nestjs/config';
@Module({
  imports: [ConfigModule, ThrottlerModule.forRoot(throttlerOptions)],

  exports: [ThrottlerModule],
})
export class ThrottlerAppModule {}
