import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './jwt.strategy';
import { AuthTokensService } from './services/auth-tokens.service';
import { RefreshTokensService } from './services/refresh-tokens.service';
import { SessionsService } from './services/sessions.service';
import { RefreshRotationService } from './services/refresh-rotation.service';
import { RefreshTokenSelectorsService } from './services/refresh-token-selectors.service';
import { RefreshSecretHashService } from './services/refresh-secret-hash.service';
import { PlatformIdentityAuthService } from './platform-identity-auth.service';
import { PlatformAuthController } from './platform-auth.controller';
import { SecurityModule } from '../../infrastructure/security/security.module';
import { AppConfigModule } from '../../infrastructure/config/config.module';
import { loadOpenIdClient, PLATFORM_OIDC_CLIENT } from './openid-client-loader';

@Module({
  providers: [
    AuthService,
    JwtStrategy,
    AuthTokensService,
    RefreshTokensService,
    SessionsService,
    RefreshRotationService,
    RefreshTokenSelectorsService,
    RefreshSecretHashService,
    PlatformIdentityAuthService,
    {
      provide: PLATFORM_OIDC_CLIENT,
      useValue: loadOpenIdClient,
    },
  ],
  controllers: [AuthController, PlatformAuthController],
  imports: [
    UsersModule,
    SecurityModule,
    JwtModule.registerAsync({
      imports: [AppConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: {
          expiresIn: '7d',
        },
      }),
    }),
  ],
})
export class AuthModule {}
