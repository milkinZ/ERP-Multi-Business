import { registerAs } from '@nestjs/config';

export const jwtConfig = registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  // keeping legacy compatibility; refresh-token flow comes later
  expiresInAccess: process.env.JWT_EXPIRES_IN_ACCESS ?? '7d',
}));
