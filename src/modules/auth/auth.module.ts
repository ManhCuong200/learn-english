import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { FacebookStrategy } from './strategies/facebook.strategy';
import { MailModule } from '@core/mail/mail.module';
import { PrismaModule } from '@core/prisma/prisma.module';
import { RolesGuard } from '@common/guards/roles.guard';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret:
        process.env.ACCESS_TOKEN_SECRET ||
        process.env.JWT_ACCESS_SECRET ||
        process.env.JWT_SECRET ||
        'access-token-secret',
      signOptions: {
        expiresIn: '15m',
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleStrategy,
    FacebookStrategy,
    RolesGuard,
  ],
  exports: [AuthService, JwtStrategy, RolesGuard],
})
export class AuthModule {}
