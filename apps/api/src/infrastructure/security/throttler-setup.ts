import { ThrottlerModuleOptions } from '@nestjs/throttler';

export const throttlerOptions: ThrottlerModuleOptions = {
  throttlers: [
    {
      ttl: 60000,
      limit: 120,
    },
  ],
};
