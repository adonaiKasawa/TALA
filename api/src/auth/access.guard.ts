import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCESS_POLICY, type AuthenticatedRequest } from './auth.metadata.js';
import { AccessTokenService } from './access-token.service.js';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    const policy = this.reflector.getAllAndOverride<string>(ACCESS_POLICY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (policy === 'public') return true;
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = req.headers.authorization;
    if (!authorization && policy === 'optional') return true;
    const match = authorization?.match(
      /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i,
    );
    if (!match || authorization!.length > 16384)
      throw new UnauthorizedException('Access token Bearer requis.');
    req.principal = await this.tokens.verify(match[1]);
    return true;
  }
}
