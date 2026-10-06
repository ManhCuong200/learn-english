import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ModeratorGuard } from './moderator.guard';

describe('ModeratorGuard', () => {
  const guard = new ModeratorGuard();

  function contextWithUser(user: unknown): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as ExecutionContext;
  }

  it('allows moderators', () => {
    expect(guard.canActivate(contextWithUser({ role: 'MODERATOR' }))).toBe(true);
  });

  it('rejects regular users', () => {
    expect(() => guard.canActivate(contextWithUser({ role: 'USER' }))).toThrow(
      UnauthorizedException,
    );
  });
});
