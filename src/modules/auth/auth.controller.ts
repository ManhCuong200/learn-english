import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { GetUser } from '@common/decorators/get-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthGuard } from '@nestjs/passport';

export interface AuthUser {
  userId: string;
  id?: string;
  email: string;
  role: UserRole;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private getRequestMeta(req: Request) {
    return {
      ip: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    };
  }

  private setRefreshTokenCookie(res: Response, refreshToken: string) {
    const isProd = process.env.NODE_ENV === 'production';
    const sameSite =
      (process.env.COOKIE_SAME_SITE as 'lax' | 'none' | 'strict') ||
      (isProd ? 'none' : 'lax');

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite,
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  private clearRefreshTokenCookie(res: Response) {
    const isProd = process.env.NODE_ENV === 'production';
    const sameSite =
      (process.env.COOKIE_SAME_SITE as 'lax' | 'none' | 'strict') ||
      (isProd ? 'none' : 'lax');

    const cookieOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite,
      path: '/auth/refresh',
    };
    res.clearCookie('refreshToken', cookieOptions);
    res.clearCookie('refresh_token', cookieOptions);
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  async login(
    @Req() req: Request,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const reqMeta = this.getRequestMeta(req);
    const result = await this.authService.login(
      dto,
      reqMeta.ip,
      reqMeta.userAgent,
    );

    if ('isTwoFactorRequired' in result) {
      return { isTwoFactorRequired: true };
    }

    this.setRefreshTokenCookie(res, result.refreshToken);
    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('moderator/login')
  async moderatorLogin(
    @Req() req: Request,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const reqMeta = this.getRequestMeta(req);
    const result = await this.authService.moderatorLogin(
      dto,
      reqMeta.ip,
      reqMeta.userAgent,
    );

    if ('isTwoFactorRequired' in result) {
      return { isTwoFactorRequired: true };
    }

    this.setRefreshTokenCookie(res, result.refreshToken);
    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('refresh')
  async refreshTokens(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      (req.cookies?.['refreshToken'] as string | undefined) ||
      (req.cookies?.['refresh_token'] as string | undefined);

    if (!token) {
      this.clearRefreshTokenCookie(res);
      throw new UnauthorizedException('No refresh token provided');
    }

    try {
      const meta = this.getRequestMeta(req);
      const result = await this.authService.refreshTokens(
        token,
        meta.ip,
        meta.userAgent,
      );
      this.setRefreshTokenCookie(res, result.refreshToken);
      return {
        accessToken: result.accessToken,
      };
    } catch (err) {
      this.clearRefreshTokenCookie(res);
      throw err;
    }
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token =
      (req.cookies?.['refreshToken'] as string | undefined) ||
      (req.cookies?.['refresh_token'] as string | undefined);

    if (token) {
      await this.authService.logout(token);
    }
    this.clearRefreshTokenCookie(res);
    return { message: 'Logout successful' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@GetUser() user: AuthUser) {
    const userId = user?.userId || user?.id || '';
    return this.authService.getMe(userId);
  }

  @Get('moderator-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR)
  getModeratorOnly(@GetUser() user: AuthUser) {
    return {
      message: 'Chào mừng Moderator! Bạn có quyền quản trị nội dung hệ thống.',
      user,
    };
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(
    @Req() req: Request & { user: import('./auth.service').OAuthUser },
    @Res() res: Response,
  ) {
    const reqMeta = this.getRequestMeta(req);
    const result = await this.authService.validateOAuthUser(req.user, reqMeta);

    if ('isTwoFactorRequired' in result) {
      return { isTwoFactorRequired: true };
    }

    this.setRefreshTokenCookie(res, result.refreshToken);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}#access_token=${result.accessToken}`);
  }

  @Get('facebook')
  @UseGuards(AuthGuard('facebook'))
  async facebookAuth() {}

  @Get('facebook/callback')
  @UseGuards(AuthGuard('facebook'))
  async facebookAuthRedirect(
    @Req() req: Request & { user: import('./auth.service').OAuthUser },
    @Res() res: Response,
  ) {
    const reqMeta = this.getRequestMeta(req);
    const result = await this.authService.validateOAuthUser(req.user, reqMeta);

    if ('isTwoFactorRequired' in result) {
      return { isTwoFactorRequired: true };
    }

    this.setRefreshTokenCookie(res, result.refreshToken);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}#access_token=${result.accessToken}`);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async getSessions(@GetUser() user: AuthUser) {
    const userId = user?.userId || user?.id || '';
    return this.authService.getSessions(userId);
  }

  @Post('sessions/:id/revoke')
  @UseGuards(JwtAuthGuard)
  async revokeSession(
    @GetUser() user: AuthUser,
    @Param('id') sessionId: string,
  ) {
    const userId = user?.userId || user?.id || '';
    await this.authService.revokeSessionById(userId, sessionId);
    return { message: 'Session revoked' };
  }

  @Post('2fa/generate')
  @UseGuards(JwtAuthGuard)
  async generate2FA(@GetUser() user: AuthUser) {
    const userId = user?.userId || user?.id || '';
    return this.authService.generateTwoFactorSecret(userId);
  }

  @Post('2fa/turn-on')
  @UseGuards(JwtAuthGuard)
  async turnOn2FA(@GetUser() user: AuthUser, @Body('code') code: string) {
    const userId = user?.userId || user?.id || '';
    return this.authService.turnOnTwoFactorAuthentication(userId, code);
  }

  @Post('2fa/turn-off')
  @UseGuards(JwtAuthGuard)
  async turnOff2FA(@GetUser() user: AuthUser) {
    const userId = user?.userId || user?.id || '';
    return this.authService.turnOffTwoFactorAuthentication(userId);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
