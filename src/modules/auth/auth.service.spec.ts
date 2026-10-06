import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { MailService } from '@core/mail/mail.service';
import { PrismaService } from '@core/prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let findUnique: jest.Mock;
  let signAsync: jest.Mock;

  beforeEach(async () => {
    delete process.env.MODERATOR_EMAIL;
    findUnique = jest.fn();
    signAsync = jest.fn().mockResolvedValue('moderator-token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique,
              create: jest.fn(),
              update: jest.fn(),
            },
            session: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn(),
            },
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync,
          },
        },
        {
          provide: MailService,
          useValue: {
            sendPasswordResetEmail: jest.fn(),
            sendSecurityAlertEmail: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns a token for a valid user', async () => {
    const password = 'UserPassword123';
    findUnique.mockResolvedValue({
      id: 'user-id',
      name: 'Regular User',
      email: 'user@example.com',
      role: UserRole.USER,
      password: await bcrypt.hash(password, 4),
    });

    const result = (await service.login(
      {
        email: 'user@example.com',
        password,
      },
      { ip: '1.2.3.4', userAgent: 'test' },
    )) as {
      accessToken: string;
      refreshToken: string;
      user: {
        id: string;
        name: string;
        email: string;
        role: UserRole;
        isTwoFactorEnabled: boolean;
      };
    };

    expect(result.accessToken).toEqual('moderator-token');
    expect(result.refreshToken).toBeDefined();
    expect(result.user).toEqual({
      id: 'user-id',
      name: 'Regular User',
      email: 'user@example.com',
      role: UserRole.USER,
      isTwoFactorEnabled: false,
    });
  });

  it('rejects a non-moderator from moderator login', async () => {
    findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      role: UserRole.USER,
      password: 'hashed-password',
    });

    await expect(
      service.moderatorLogin(
        {
          email: 'user@example.com',
          password: 'password',
        },
        { ip: '1.2.3.4', userAgent: 'test' },
      ),
    ).rejects.toThrow('Invalid moderator credentials');
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('returns a token for an moderator', async () => {
    const password = 'ModeratorPassword123';
    findUnique.mockResolvedValue({
      id: 'moderator-id',
      name: 'Moderatoristrator',
      email: 'moderator@example.com',
      role: UserRole.MODERATOR,
      password: await bcrypt.hash(password, 4),
    });

    const result = (await service.moderatorLogin(
      {
        email: 'moderator@example.com',
        password,
      },
      { ip: '1.2.3.4', userAgent: 'test' },
    )) as {
      accessToken: string;
      refreshToken: string;
      user: {
        id: string;
        name: string;
        email: string;
        role: UserRole;
        isTwoFactorEnabled: boolean;
      };
    };

    expect(result.accessToken).toEqual('moderator-token');
    expect(result.refreshToken).toBeDefined();
    expect(result.user).toEqual({
      id: 'moderator-id',
      name: 'Moderatoristrator',
      email: 'moderator@example.com',
      role: UserRole.MODERATOR,
      isTwoFactorEnabled: false,
    });
  });
});
