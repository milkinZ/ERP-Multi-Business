import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => {
  // populated by ConfigModule via validateEnv
  return {};
});
