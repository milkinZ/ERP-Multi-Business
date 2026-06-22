import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';

import { CurrentUser } from '../../common/decorator/current-user.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';

import { CsrfRefreshGuard } from '../../infrastructure/security/csrf-refresh.guard';

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

  @Post('logout')
  logout(@Body() body: LogoutDto, @Res({ passthrough: true }) res: Response) {
    return this.authService.logout(body.refreshToken, res);
  }

  @UseGuards(CsrfRefreshGuard)
  @Post('refresh')
  refresh(@Body() body: RefreshDto, @Res({ passthrough: true }) res: Response) {
    return this.authService.refresh(body.refreshToken, body.csrfToken, res);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return user;
  }
}
