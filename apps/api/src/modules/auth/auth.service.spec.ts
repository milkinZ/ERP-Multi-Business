import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaMockModule } from '../../test/prisma-mock.module';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { AuthTokensService } from './services/auth-tokens.service';
import { RefreshTokensService } from './services/refresh-tokens.service';
import { SessionsService } from './services/sessions.service';
import { RefreshRotationService } from './services/refresh-rotation.service';
import { RefreshTokenSelectorsService } from './services/refresh-token-selectors.service';
import { RefreshSecretHashService } from './services/refresh-secret-hash.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaMockModule],
      providers: [
        AuthService,
        UsersService,
        { provide: JwtService, useValue: {} },
        { provide: AuthTokensService, useValue: {} },
        { provide: RefreshTokensService, useValue: {} },
        { provide: SessionsService, useValue: {} },
        { provide: RefreshRotationService, useValue: {} },
        { provide: RefreshTokenSelectorsService, useValue: {} },
        { provide: RefreshSecretHashService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
