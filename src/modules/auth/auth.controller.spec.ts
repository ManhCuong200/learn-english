import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
    moderatorLogin: jest.Mock;
    refreshTokens: jest.Mock;
    logout: jest.Mock;
    getMe: jest.Mock;
  };

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      moderatorLogin: jest.fn(),
      refreshTokens: jest.fn(),
      logout: jest.fn(),
      getMe: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('delegates to authService.register', async () => {
      const dto = {
        name: 'Learner',
        email: 'learner@example.com',
        password: 'password123',
      };
      authService.register.mockResolvedValue({
        message: 'Register successful',
        user: { id: '1', ...dto, role: UserRole.USER },
      });

      const res = await controller.register(dto);
      expect(authService.register).toHaveBeenCalledWith(dto);
      expect(res.user.role).toBe(UserRole.USER);
    });
  });

  describe('login', () => {
    it('sets cookie and returns accessToken and user', async () => {
      const dto = { email: 'test@example.com', password: 'password123' };
      const req = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest' },
      } as unknown as Request;
      const cookieMock = jest.fn();
      const res = {
        cookie: cookieMock,
      } as unknown as Response;

      authService.login.mockResolvedValue({
        accessToken: 'access-jwt',
        refreshToken: 'refresh-jwt',
        user: { id: '1', email: dto.email, role: UserRole.USER },
      });

      const result = await controller.login(req, dto, res);

      expect(authService.login).toHaveBeenCalledWith(dto, '127.0.0.1', 'jest');
      expect(cookieMock).toHaveBeenCalledWith(
        'refreshToken',
        'refresh-jwt',
        expect.objectContaining({
          httpOnly: true,
          path: '/auth/refresh',
        }),
      );
      expect(result).toEqual({
        accessToken: 'access-jwt',
        user: { id: '1', email: dto.email, role: UserRole.USER },
      });
    });
  });

  describe('refreshTokens', () => {
    it('rotates refresh token and returns new accessToken', async () => {
      const req = {
        cookies: { refreshToken: 'old-refresh-token' },
        ip: '127.0.0.1',
        headers: {},
      } as unknown as Request;
      const cookieMock = jest.fn();
      const res = {
        cookie: cookieMock,
      } as unknown as Response;

      authService.refreshTokens.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const result = await controller.refreshTokens(req, res);

      expect(authService.refreshTokens).toHaveBeenCalledWith(
        'old-refresh-token',
        '127.0.0.1',
        'unknown',
      );
      expect(cookieMock).toHaveBeenCalledWith(
        'refreshToken',
        'new-refresh-token',
        expect.objectContaining({
          httpOnly: true,
          path: '/auth/refresh',
        }),
      );
      expect(result).toEqual({
        accessToken: 'new-access-token',
      });
    });

    it('throws UnauthorizedException and clears cookie if no cookie is present', async () => {
      const req = { cookies: {} } as unknown as Request;
      const clearCookieMock = jest.fn();
      const res = {
        clearCookie: clearCookieMock,
      } as unknown as Response;

      await expect(controller.refreshTokens(req, res)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(clearCookieMock).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('clears cookie and calls authService.logout', async () => {
      const req = {
        cookies: { refreshToken: 'token-to-revoke' },
      } as unknown as Request;
      const clearCookieMock = jest.fn();
      const res = {
        clearCookie: clearCookieMock,
      } as unknown as Response;

      const result = await controller.logout(req, res);

      expect(authService.logout).toHaveBeenCalledWith('token-to-revoke');
      expect(clearCookieMock).toHaveBeenCalled();
      expect(result).toEqual({ message: 'Logout successful' });
    });
  });

  describe('moderator-only', () => {
    it('returns welcome message for moderator', () => {
      const user = {
        userId: 'mod-1',
        email: 'mod@example.com',
        role: UserRole.MODERATOR,
      };
      const result = controller.getModeratorOnly(user);
      expect(result.message).toContain('Moderator');
      expect(result.user).toEqual(user);
    });
  });
});
