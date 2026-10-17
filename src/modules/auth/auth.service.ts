import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { UserRole } from '@prisma/client';

import { PrismaService } from '@core/prisma/prisma.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MailService } from '@core/mail/mail.service';

export interface RequestMeta {
  ip: string;
  userAgent: string;
}

export interface OAuthUser {
  provider: 'google' | 'facebook';
  providerId: string;
  email: string;
  name: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        password: hashedPassword,
        role: UserRole.USER,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return {
      message: 'Register successful',
      user,
    };
  }

  async login(
    dto: LoginDto,
    ipOrMeta?: string | RequestMeta,
    userAgent?: string,
  ) {
    const { ip, ua } = this.parseMeta(ipOrMeta, userAgent);
    return this.authenticate(dto, ip, ua, 'Invalid email or password');
  }

  async moderatorLogin(
    dto: LoginDto,
    ipOrMeta?: string | RequestMeta,
    userAgent?: string,
  ) {
    const { ip, ua } = this.parseMeta(ipOrMeta, userAgent);
    return this.authenticate(
      dto,
      ip,
      ua,
      'Invalid moderator credentials',
      UserRole.MODERATOR,
    );
  }

  private parseMeta(ipOrMeta?: string | RequestMeta, userAgent?: string) {
    if (typeof ipOrMeta === 'object' && ipOrMeta !== null) {
      return {
        ip: ipOrMeta.ip || 'unknown',
        ua: ipOrMeta.userAgent || 'unknown',
      };
    }
    return {
      ip: (typeof ipOrMeta === 'string' ? ipOrMeta : undefined) || 'unknown',
      ua: userAgent || 'unknown',
    };
  }

  private async authenticate(
    dto: LoginDto,
    ip: string,
    ua: string,
    errorMessage: string,
    requiredRole?: UserRole,
  ) {
    const email = dto.email.trim().toLowerCase();
    console.log(`[AUTH DEBUG] Attempting login for email: ${email}`);

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    console.log(
      `[AUTH DEBUG] User found: ${!!user}, Role: ${user?.role}, Required: ${requiredRole}`,
    );

    if (!user || (requiredRole && user.role !== requiredRole)) {
      console.log(`[AUTH DEBUG] Failed at user/role check`);
      throw new UnauthorizedException(errorMessage);
    }

    if (requiredRole === UserRole.MODERATOR) {
      const moderatorEmailEnv =
        process.env.MODERATOR_EMAIL?.trim().toLowerCase();
      console.log(`[AUTH DEBUG] Env moderator email: ${moderatorEmailEnv}`);
      if (moderatorEmailEnv && email !== moderatorEmailEnv) {
        console.log(`[AUTH DEBUG] Failed at moderator env email check`);
        throw new UnauthorizedException(errorMessage);
      }
    }

    if (!user.password) {
      console.log(`[AUTH DEBUG] Failed at password missing check`);
      throw new UnauthorizedException('Please login with Google or Facebook');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      console.log(`[AUTH DEBUG] Failed at locked check`);
      throw new UnauthorizedException(
        'Account locked due to too many failed attempts. Try again later.',
      );
    }

    const passwordMatched = await bcrypt.compare(dto.password, user.password);
    console.log(`[AUTH DEBUG] Password matched: ${passwordMatched}`);

    if (!passwordMatched) {
      const failedAttempts = user.failedLoginAttempts + 1;
      let lockedUntil: Date | null = null;
      if (failedAttempts >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: failedAttempts, lockedUntil },
      });
      console.log(`[AUTH DEBUG] Failed at password match check`);
      throw new UnauthorizedException(errorMessage);
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    if (user.isTwoFactorEnabled) {
      if (!dto.twoFactorCode) {
        return { isTwoFactorRequired: true };
      }

      const isCodeValid = authenticator.verify({
        token: dto.twoFactorCode,
        secret: user.twoFactorSecret!,
      });

      if (!isCodeValid) {
        throw new UnauthorizedException('Invalid 2FA code');
      }
    }

    return this.createSession(user, ip, ua);
  }

  private async createSession(
    user: {
      id: string;
      name: string;
      email: string;
      role: UserRole;
      isTwoFactorEnabled?: boolean;
    },
    ip: string,
    ua: string,
  ) {
    const latestSession = await this.prisma.session.findFirst({
      where: { userId: user.id },
      select: { ipAddress: true, userAgent: true },
      orderBy: { createdAt: 'desc' },
    });

    if (
      latestSession &&
      (latestSession.ipAddress !== ip || latestSession.userAgent !== ua)
    ) {
      this.mailService
        .sendSecurityAlertEmail(user.email, ip, ua)
        .catch((err) =>
          console.error(
            'Failed to send security alert email asynchronously:',
            err,
          ),
        );
    }

    const { accessToken, refreshToken } = await this.generateTokens(
      user.id,
      user.email,
      user.role,
    );

    const refreshTokenHash = createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        ipAddress: ip,
        userAgent: ua,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isTwoFactorEnabled: user.isTwoFactorEnabled ?? false,
      },
    };
  }

  async validateOAuthUser(profile: OAuthUser, reqMeta: RequestMeta) {
    const searchCondition =
      profile.provider === 'google'
        ? { googleId: profile.providerId }
        : { facebookId: profile.providerId };

    let user = await this.prisma.user.findUnique({
      where: searchCondition,
    });

    if (!user) {
      user = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });

      if (user) {
        // Link new provider to existing user
        const updateData =
          profile.provider === 'google'
            ? { googleId: profile.providerId }
            : { facebookId: profile.providerId };

        user = await this.prisma.user.update({
          where: { id: user.id },
          data: updateData,
        });
      } else {
        // Create new user
        user = await this.prisma.user.create({
          data: {
            name: profile.name,
            email: profile.email,
            role: UserRole.USER,
            googleId: profile.provider === 'google' ? profile.providerId : null,
            facebookId:
              profile.provider === 'facebook' ? profile.providerId : null,
          },
        });
      }
    }

    return this.createSession(user, reqMeta.ip, reqMeta.userAgent);
  }

  async generateTokens(userId: string, email: string, role: UserRole) {
    const accessTokenSecret =
      process.env.ACCESS_TOKEN_SECRET ||
      process.env.JWT_ACCESS_SECRET ||
      process.env.JWT_SECRET ||
      'access-token-secret';
    const refreshTokenSecret =
      process.env.REFRESH_TOKEN_SECRET ||
      process.env.JWT_REFRESH_SECRET ||
      process.env.JWT_SECRET ||
      'refresh-token-secret';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, role },
        {
          secret: accessTokenSecret,
          expiresIn: '15m',
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, jti: randomUUID() },
        {
          secret: refreshTokenSecret,
          expiresIn: '7d',
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  async refreshTokens(
    rawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const refreshTokenSecret =
      process.env.REFRESH_TOKEN_SECRET ||
      process.env.JWT_REFRESH_SECRET ||
      process.env.JWT_SECRET ||
      'refresh-token-secret';

    try {
      await this.jwtService.verifyAsync(rawRefreshToken, {
        secret: refreshTokenSecret,
      });
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired refresh token signature',
      );
    }

    const tokenHash = createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');

    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: tokenHash },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await this.prisma.session
          .delete({ where: { id: session.id } })
          .catch(() => null);
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Refresh Token Rotation: Delete old session, generate new token pair, create new session
    await this.prisma.session.delete({ where: { id: session.id } });

    const { accessToken, refreshToken: newRefreshToken } =
      await this.generateTokens(
        session.user.id,
        session.user.email,
        session.user.role,
      );

    const newRefreshTokenHash = createHash('sha256')
      .update(newRefreshToken)
      .digest('hex');

    await this.prisma.session.create({
      data: {
        userId: session.user.id,
        refreshTokenHash: newRefreshTokenHash,
        ipAddress: ipAddress || session.ipAddress,
        userAgent: userAgent || session.userAgent,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async refreshToken(
    rawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    return this.refreshTokens(rawRefreshToken, ipAddress, userAgent);
  }

  async logout(rawRefreshToken: string) {
    if (!rawRefreshToken) return;
    const tokenHash = createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');
    await this.prisma.session.deleteMany({
      where: { refreshTokenHash: tokenHash },
    });
  }

  async revokeSession(rawRefreshToken: string) {
    return this.logout(rawRefreshToken);
  }

  async getSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        lastActive: true,
        createdAt: true,
      },
      orderBy: { lastActive: 'desc' },
    });
  }

  async revokeSessionById(userId: string, sessionId: string) {
    await this.prisma.session.deleteMany({
      where: {
        id: sessionId,
        userId: userId,
      },
    });
  }

  async generateTwoFactorSecret(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(
      user.email,
      'EnglishLearningApp',
      secret,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret },
    });

    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

    return {
      secret,
      qrCodeDataUrl,
    };
  }

  async turnOnTwoFactorAuthentication(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (!user.twoFactorSecret) {
      throw new BadRequestException('2FA secret not generated');
    }

    const isCodeValid = authenticator.verify({
      token: code,
      secret: user.twoFactorSecret,
    });

    if (!isCodeValid) {
      throw new BadRequestException('Invalid 2FA code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isTwoFactorEnabled: true },
    });

    return { message: '2FA turned on successfully' };
  }

  async turnOffTwoFactorAuthentication(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { isTwoFactorEnabled: false, twoFactorSecret: null },
    });

    return { message: '2FA turned off successfully' };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isTwoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      return {
        message: 'If the email exists, a password reset link has been sent.',
      };
    }

    await this.prisma.passwordResetToken.deleteMany({
      where: {
        userId: user.id,
      },
    });

    const resetToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    await this.mailService.sendPasswordResetEmail(user.email, resetUrl);

    return {
      message: 'If the email exists, a password reset link has been sent.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: {
        tokenHash,
      },
    });

    if (!resetToken) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    if (resetToken.expiresAt < new Date()) {
      await this.prisma.passwordResetToken.delete({
        where: {
          id: resetToken.id,
        },
      });

      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: {
          id: resetToken.userId,
        },
        data: {
          password: hashedPassword,
        },
      }),

      this.prisma.passwordResetToken.delete({
        where: {
          id: resetToken.id,
        },
      }),

      this.prisma.passwordResetToken.deleteMany({
        where: {
          userId: resetToken.userId,
        },
      }),
    ]);

    return {
      message: 'Password reset successful',
    };
  }
}
