import { ThrottlerOptions } from '@nestjs/throttler';

export const throttlerOptions: ThrottlerOptions = {
  ttl: 60,
  limit: 120,
};
