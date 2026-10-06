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
import { createHash, randomBytes } from 'crypto';
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

  async login(dto: LoginDto, reqMeta: RequestMeta) {
    return this.authenticate(dto, reqMeta, 'Invalid email or password');
  }

  async moderatorLogin(dto: LoginDto, reqMeta: RequestMeta) {
    return this.authenticate(
      dto,
      reqMeta,
      'Invalid moderator credentials',
      UserRole.MODERATOR,
    );
  }

  private async authenticate(
    dto: LoginDto,
    reqMeta: RequestMeta,
    errorMessage: string,
    requiredRole?: UserRole,
  ) {
    const email = dto.email.trim().toLowerCase();
    console.log(`[AUTH DEBUG] Attempting login for email: ${email}`);

    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    
    console.log(`[AUTH DEBUG] User found: ${!!user}, Role: ${user?.role}, Required: ${requiredRole}`);

    if (!user || (requiredRole && user.role !== requiredRole)) {
      console.log(`[AUTH DEBUG] Failed at user/role check`);
      throw new UnauthorizedException(errorMessage);
    }

    if (requiredRole === UserRole.MODERATOR) {
      const moderatorEmailEnv = process.env.MODERATOR_EMAIL?.trim().toLowerCase();
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

    return this.createSession(user, reqMeta);
  }

  private async createSession(
    user: {
      id: string;
      name: string;
      email: string;
      role: UserRole;
      isTwoFactorEnabled?: boolean;
    },
    reqMeta: RequestMeta,
  ) {
    const latestSession = await this.prisma.session.findFirst({
      where: { userId: user.id },
      select: { ipAddress: true, userAgent: true },
      orderBy: { createdAt: 'desc' },
    });

    if (
      latestSession &&
      (latestSession.ipAddress !== reqMeta.ip ||
        latestSession.userAgent !== reqMeta.userAgent)
    ) {
      this.mailService
        .sendSecurityAlertEmail(user.email, reqMeta.ip, reqMeta.userAgent)
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
        ipAddress: reqMeta.ip,
        userAgent: reqMeta.userAgent,
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
            googleId: profile.provider === 'google' ? profile.providerId : null,
            facebookId:
              profile.provider === 'facebook' ? profile.providerId : null,
          },
        });
      }
    }

    return this.createSession(user, reqMeta);
  }

  async generateTokens(userId: string, email: string, role: string) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, role },
        {
          secret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET,
          expiresIn: '15m',
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, jti: randomBytes(16).toString('hex') },
        {
          secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
          expiresIn: '7d',
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }

  async refreshToken(token: string) {
    if (!token) throw new UnauthorizedException('No refresh token provided');

    try {
      await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired refresh token signature',
      );
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');

    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: tokenHash },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await this.prisma.session.delete({ where: { id: session.id } });
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await this.generateTokens(
        session.user.id,
        session.user.email,
        session.user.role,
      );
    const newRefreshTokenHash = createHash('sha256')
      .update(newRefreshToken)
      .digest('hex');

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        lastActive: new Date(),
      },
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async revokeSession(token: string) {
    if (!token) return;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await this.prisma.session.deleteMany({
      where: { refreshTokenHash: tokenHash },
    });
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

    // Không tiết lộ email có tồn tại hay không
    if (!user) {
      return {
        message: 'If the email exists, a password reset link has been sent.',
      };
    }

    // Xóa các token cũ của user
    await this.prisma.passwordResetToken.deleteMany({
      where: {
        userId: user.id,
      },
    });

    // Tạo token ngẫu nhiên
    const resetToken = randomBytes(32).toString('hex');

    // Chỉ lưu hash của token vào database
    const tokenHash = createHash('sha256').update(resetToken).digest('hex');

    // Token hết hạn sau 15 phút
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

      // Token chỉ được sử dụng một lần
      this.prisma.passwordResetToken.delete({
        where: {
          id: resetToken.id,
        },
      }),

      // Xóa các reset token khác của user
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
