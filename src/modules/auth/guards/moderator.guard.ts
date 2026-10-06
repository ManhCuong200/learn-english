import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

interface ModeratorRequest extends Request {
  user?: {
    email?: string;
    role?: 'USER' | 'MODERATOR';
  };
}

@Injectable()
export class ModeratorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ModeratorRequest>();

    if (request.user?.role !== 'MODERATOR') {
      throw new UnauthorizedException('Moderator access required');
    }

    const moderatorEmailEnv = process.env.MODERATOR_EMAIL?.trim().toLowerCase();
    if (moderatorEmailEnv && request.user?.email?.toLowerCase() !== moderatorEmailEnv) {
      throw new UnauthorizedException('Moderator access required');
    }

    return true;
  }
}
