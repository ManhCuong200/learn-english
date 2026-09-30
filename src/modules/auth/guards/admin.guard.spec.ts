import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  function contextWithUser(user: unknown): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as ExecutionContext;
  }

  it('allows admins', () => {
    expect(guard.canActivate(contextWithUser({ role: 'ADMIN' }))).toBe(true);
  });

  it('rejects regular users', () => {
    expect(() => guard.canActivate(contextWithUser({ role: 'USER' }))).toThrow(
      UnauthorizedException,
    );
  });
});
