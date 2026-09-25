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
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthGuard } from '@nestjs/passport';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    name: string;
    email: string;
    role: 'USER' | 'ADMIN';
  };
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

  private setCookies(res: Response, accessToken: string, refreshToken: string) {
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 15 * 60 * 1000, // 15 mins
    });
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
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
    const result = await this.authService.login(dto, reqMeta);

    if ('isTwoFactorRequired' in result) {
      return { isTwoFactorRequired: true };
    }

    this.setCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Post('admin/login')
  async adminLogin(
    @Req() req: Request,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const reqMeta = this.getRequestMeta(req);
    const result = await this.authService.adminLogin(dto, reqMeta);

    if ('isTwoFactorRequired' in result) {
      return { isTwoFactorRequired: true };
    }

    this.setCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Post('refresh')
  async refreshTokens(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.['refresh_token'];
    if (!token) {
      throw new UnauthorizedException('No refresh token provided');
    }
    const result = await this.authService.refreshToken(token);
    this.setCookies(res, result.accessToken, result.refreshToken);
    return { message: 'Tokens refreshed' };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.['refresh_token'];
    if (token) {
      await this.authService.revokeSession(token);
    }
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    return { message: 'Logout successful' };
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
      // For OAuth, we'd typically redirect to a frontend page that asks for the 2FA code.
      // But we will just return it for now.
      return { isTwoFactorRequired: true };
    }

    this.setCookies(res, result.accessToken, result.refreshToken);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(frontendUrl);
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

    this.setCookies(res, result.accessToken, result.refreshToken);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(frontendUrl);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async getSessions(@Req() req: AuthenticatedRequest) {
    return this.authService.getSessions(req.user.id);
  }

  @Post('sessions/:id/revoke')
  @UseGuards(JwtAuthGuard)
  async revokeSession(
    @Req() req: AuthenticatedRequest,
    @Param('id') sessionId: string,
  ) {
    await this.authService.revokeSessionById(req.user.id, sessionId);
    return { message: 'Session revoked' };
  }

  @Post('2fa/generate')
  @UseGuards(JwtAuthGuard)
  async generate2FA(@Req() req: AuthenticatedRequest) {
    return this.authService.generateTwoFactorSecret(req.user.id);
  }

  @Post('2fa/turn-on')
  @UseGuards(JwtAuthGuard)
  async turnOn2FA(
    @Req() req: AuthenticatedRequest,
    @Body('code') code: string,
  ) {
    return this.authService.turnOnTwoFactorAuthentication(req.user.id, code);
  }

  @Post('2fa/turn-off')
  @UseGuards(JwtAuthGuard)
  async turnOff2FA(@Req() req: AuthenticatedRequest) {
    return this.authService.turnOffTwoFactorAuthentication(req.user.id);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Req() req: AuthenticatedRequest) {
    return this.authService.getMe(req.user.id);
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
