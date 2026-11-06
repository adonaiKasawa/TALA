import {
  SetMetadata,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

export type Principal = {
  issuer: string;
  subject: string;
  clientId: string;
  scopes: string[];
  role?: string;
  amr?: string[];
  authTime?: number;
};
export type AuthenticatedRequest = Request & { principal?: Principal };
export const ACCESS_POLICY = 'tala:access-policy';
export const Public = () => SetMetadata(ACCESS_POLICY, 'public');
export const OptionalAuth = () => SetMetadata(ACCESS_POLICY, 'optional');
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().principal,
);
