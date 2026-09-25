import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let findUnique: jest.Mock;
  let signAsync: jest.Mock;

  beforeEach(async () => {
    findUnique = jest.fn();
    signAsync = jest.fn().mockResolvedValue('admin-token');

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
    )) as any;

    expect(result.accessToken).toEqual('admin-token');
    expect(result.refreshToken).toBeDefined();
    expect(result.user).toEqual({
      id: 'user-id',
      name: 'Regular User',
      email: 'user@example.com',
      role: UserRole.USER,
    });
  });

  it('rejects a non-admin from admin login', async () => {
    findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      role: UserRole.USER,
      password: 'hashed-password',
    });

    await expect(
      service.adminLogin(
        {
          email: 'user@example.com',
          password: 'password',
        },
        { ip: '1.2.3.4', userAgent: 'test' },
      ),
    ).rejects.toThrow('Invalid admin credentials');
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('returns a token for an admin', async () => {
    const password = 'AdminPassword123';
    findUnique.mockResolvedValue({
      id: 'admin-id',
      name: 'Administrator',
      email: 'admin@example.com',
      role: UserRole.ADMIN,
      password: await bcrypt.hash(password, 4),
    });

    const result = (await service.adminLogin(
      {
        email: 'admin@example.com',
        password,
      },
      { ip: '1.2.3.4', userAgent: 'test' },
    )) as any;

    expect(result.accessToken).toEqual('admin-token');
    expect(result.refreshToken).toBeDefined();
    expect(result.user).toEqual({
      id: 'admin-id',
      name: 'Administrator',
      email: 'admin@example.com',
      role: UserRole.ADMIN,
    });
  });
});
