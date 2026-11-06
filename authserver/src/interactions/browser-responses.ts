import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { map } from 'rxjs';
import { escape, page } from './pages.js';

export function continuation(req: Request) {
  const target: unknown = req.signedCookies?.tala_continue;
  return typeof target === 'string' &&
    /^\/interaction\/[A-Za-z0-9_-]+$/.test(target)
    ? target
    : '/';
}
@Injectable()
export class BrowserResponses implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const paths = [
      '/account/register',
      '/account/password/request',
      '/account/email/request',
      '/account/email/confirm',
      '/account/password/reset',
    ];
    if (!req.headers.accept?.includes('text/html') || !paths.includes(req.path))
      return next.handle();
    return next.handle().pipe(
      map((data: { message?: string }) => {
        res.type('html');
        return page(
          'C’est fait',
          `<p role="status">${escape(data.message || 'Opération effectuée.')}</p><p>Si un email est attendu, consultez votre boîte de réception et vos courriers indésirables.</p><a class="button" href="${escape(continuation(req))}">Revenir à la connexion</a>`,
        );
      }),
    );
  }
}
