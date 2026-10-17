import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { MailService } from '@core/mail/mail.service';
import { PrismaService } from '@core/prisma/prisma.service';
import { AuthService } from './auth.service';

interface LoginSuccessResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    isTwoFactorEnabled: boolean;
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let userFindUnique: jest.Mock;
  let userCreate: jest.Mock;
  let sessionFindFirst: jest.Mock;
  let sessionFindUnique: jest.Mock;
  let sessionCreate: jest.Mock;
  let sessionDelete: jest.Mock;
  let sessionDeleteMany: jest.Mock;
  let signAsync: jest.Mock;
  let verifyAsync: jest.Mock;

  beforeEach(async () => {
    delete process.env.MODERATOR_EMAIL;
    userFindUnique = jest.fn();
    userCreate = jest.fn();
    sessionFindFirst = jest.fn().mockResolvedValue(null);
    sessionFindUnique = jest.fn();
    sessionCreate = jest.fn();
    sessionDelete = jest.fn();
    sessionDeleteMany = jest.fn();
    signAsync = jest.fn().mockResolvedValue('test-token');
    verifyAsync = jest.fn().mockResolvedValue({ sub: 'user-id' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: userFindUnique,
              create: userCreate,
              update: jest.fn(),
            },
            session: {
              findFirst: sessionFindFirst,
              findUnique: sessionFindUnique,
              create: sessionCreate,
              delete: sessionDelete,
              deleteMany: sessionDeleteMany,
            },
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync,
            verifyAsync,
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

  describe('register', () => {
    it('creates a new user with USER role and hashed password', async () => {
      userFindUnique.mockResolvedValue(null);
      userCreate.mockImplementation(
        ({
          data,
        }: {
          data: { name: string; email: string; role: UserRole };
        }) => ({
          id: 'new-user-id',
          name: data.name,
          email: data.email,
          role: data.role,
          createdAt: new Date(),
        }),
      );

      const result = await service.register({
        name: 'Learner One',
        email: 'learner@example.com',
        password: 'password123',
      });

      expect(result.message).toBe('Register successful');
      expect(result.user.email).toBe('learner@example.com');
      expect(result.user.role).toBe(UserRole.USER);
      expect(userCreate).toHaveBeenCalled();
      const lastCall = userCreate.mock.calls[0] as [
        { data: { name: string; email: string; role: UserRole } },
      ];
      expect(lastCall[0].data.name).toBe('Learner One');
      expect(lastCall[0].data.email).toBe('learner@example.com');
      expect(lastCall[0].data.role).toBe(UserRole.USER);
    });

    it('throws ConflictException if email is already taken', async () => {
      userFindUnique.mockResolvedValue({
        id: 'existing-id',
        email: 'learner@example.com',
      });

      await expect(
        service.register({
          name: 'Learner Two',
          email: 'learner@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('returns a token for a valid user and creates session', async () => {
      const password = 'UserPassword123';
      userFindUnique.mockResolvedValue({
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
        '1.2.3.4',
        'test-agent',
      )) as unknown as LoginSuccessResult;

      expect(result.accessToken).toBe('test-token');
      expect(result.refreshToken).toBe('test-token');
      expect(result.user).toEqual({
        id: 'user-id',
        name: 'Regular User',
        email: 'user@example.com',
        role: UserRole.USER,
        isTwoFactorEnabled: false,
      });
      expect(sessionCreate).toHaveBeenCalled();
      const sessionCall = sessionCreate.mock.calls[0] as [
        { data: { userId: string; ipAddress: string; userAgent: string } },
      ];
      expect(sessionCall[0].data.userId).toBe('user-id');
      expect(sessionCall[0].data.ipAddress).toBe('1.2.3.4');
      expect(sessionCall[0].data.userAgent).toBe('test-agent');
    });
  });

  describe('refreshTokens', () => {
    it('rotates refresh token: deletes old session and creates new one', async () => {
      const rawToken = 'valid-refresh-token';
      const mockSession = {
        id: 'old-session-id',
        userId: 'user-id',
        refreshTokenHash: 'some-hash',
        expiresAt: new Date(Date.now() + 100000),
        user: {
          id: 'user-id',
          email: 'user@example.com',
          role: UserRole.USER,
        },
      };

      sessionFindUnique.mockResolvedValue(mockSession);
      sessionDelete.mockResolvedValue(mockSession);

      const result = await service.refreshTokens(
        rawToken,
        '1.2.3.4',
        'test-agent',
      );

      expect(verifyAsync).toHaveBeenCalled();
      expect(sessionDelete).toHaveBeenCalledWith({
        where: { id: 'old-session-id' },
      });
      expect(sessionCreate).toHaveBeenCalled();
      expect(result.accessToken).toBe('test-token');
      expect(result.refreshToken).toBe('test-token');
    });

    it('throws UnauthorizedException if session is not found or expired', async () => {
      sessionFindUnique.mockResolvedValue(null);

      await expect(service.refreshTokens('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException if jwt verify fails', async () => {
      verifyAsync.mockRejectedValue(new Error('Signature verification failed'));

      await expect(
        service.refreshTokens('bad-signature-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('deletes session from database matching token hash', async () => {
      await service.logout('raw-token');
      expect(sessionDeleteMany).toHaveBeenCalled();
      const deleteCall = sessionDeleteMany.mock.calls[0] as [
        { where: { refreshTokenHash: string } },
      ];
      expect(typeof deleteCall[0].where.refreshTokenHash).toBe('string');
      expect(deleteCall[0].where.refreshTokenHash.length).toBeGreaterThan(0);
    });
  });

  describe('moderatorLogin', () => {
    it('rejects a non-moderator from moderator login', async () => {
      userFindUnique.mockResolvedValue({
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

    it('returns a token for a moderator', async () => {
      const password = 'ModeratorPassword123';
      userFindUnique.mockResolvedValue({
        id: 'moderator-id',
        name: 'Moderator',
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
      )) as unknown as LoginSuccessResult;

      expect(result.accessToken).toBe('test-token');
      expect(result.refreshToken).toBe('test-token');
      expect(result.user.role).toBe(UserRole.MODERATOR);
    });
  });
});
