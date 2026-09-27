import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

interface AdminRequest extends Request {
  user?: {
    email?: string;
    role?: 'USER' | 'ADMIN';
  };
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminRequest>();

    if (request.user?.role !== 'ADMIN') {
      throw new UnauthorizedException('Admin access required');
    }

    const adminEmailEnv = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (
      adminEmailEnv &&
      request.user?.email?.toLowerCase() !== adminEmailEnv
    ) {
      throw new UnauthorizedException('Admin access required');
    }

    return true;
  }
}
