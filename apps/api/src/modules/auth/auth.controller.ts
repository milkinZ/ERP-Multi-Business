import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';

import { CurrentUser } from '../../common/decorator/current-user.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';

import { CsrfRefreshGuard } from '../../infrastructure/security/csrf-refresh.guard';
import { REFRESH_COOKIE_NAME } from '../../infrastructure/security/security.constants';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post('login')
  login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.authService.login(body.email, body.password, res);
  }

  @Get('csrf')
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.issueCsrfToken(req, res);
  }

  @UseGuards(CsrfRefreshGuard)
  @Post('logout')
  logout(
    @Body() _body: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const refreshTokenValue = cookies?.[REFRESH_COOKIE_NAME];
    const refreshToken =
      typeof refreshTokenValue === 'string' ? refreshTokenValue : '';
    return this.authService.logout(refreshToken, res);
  }

  @UseGuards(CsrfRefreshGuard)
  @Post('refresh')
  refresh(
    @Body() body: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const refreshTokenValue = cookies?.[REFRESH_COOKIE_NAME];
    const refreshToken =
      typeof refreshTokenValue === 'string' ? refreshTokenValue : '';
    return this.authService.refresh(refreshToken, body.csrfToken, res);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return user;
  }
}
