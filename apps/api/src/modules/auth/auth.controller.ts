import {
  Body,
  Controller,
  GoneException,
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
import { LogoutDto } from './dto/logout.dto';
import { RefreshDto } from './dto/refresh.dto';

import { CurrentUser } from '../../common/decorator/current-user.decorator';
import type { JwtUser } from '../../common/interfaces/jwt-user.interface';

import { CsrfRefreshGuard } from '../../infrastructure/security/csrf-refresh.guard';
import { REFRESH_COOKIE_NAME } from '../../infrastructure/security/security.constants';
import { UsersInvitationsService } from '../users/users-invitations.service';
import { AcceptUserInvitationDto } from '../users/dto/accept-user-invitation.dto';
import { SwitchOutletDto } from './dto/switch-outlet.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private readonly userInvitations: UsersInvitationsService,
  ) {}

  @Post('register')
  register() {
    throw new GoneException(
      'Public registration is disabled; use a tenant invitation link',
    );
  }

  @Post('invitations/accept')
  acceptInvitation(@Body() body: AcceptUserInvitationDto) {
    return this.userInvitations.accept(body.token, body.password);
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

  @UseGuards(JwtAuthGuard)
  @Get('outlets')
  getAccessibleOutlets(@CurrentUser() user: JwtUser) {
    return this.authService.getAccessibleOutlets(user);
  }

  @UseGuards(JwtAuthGuard, CsrfRefreshGuard)
  @Post('outlet/switch')
  switchOutlet(
    @Body() body: SwitchOutletDto,
    @Req() req: Request,
    @CurrentUser() user: JwtUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const refreshTokenValue = cookies?.[REFRESH_COOKIE_NAME];
    const refreshToken =
      typeof refreshTokenValue === 'string' ? refreshTokenValue : '';
    return this.authService.switchOutlet(
      user,
      body.outletId,
      refreshToken,
      body.csrfToken,
      res,
    );
  }
}
