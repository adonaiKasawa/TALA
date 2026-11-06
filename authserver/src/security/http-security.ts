import {
  ForbiddenException,
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { equal, token } from './crypto.js';
import type { AuthConfig } from '../config/config.js';
import { page, escape } from '../interactions/pages.js';
import { continuation } from '../interactions/browser-responses.js';
export function csrfToken(req: Request, res: Response, config: AuthConfig) {
  const saved: unknown = req.signedCookies?.tala_csrf;
  const csrf = typeof saved === 'string' ? saved : token();
  res.cookie('tala_csrf', csrf, {
    signed: true,
    httpOnly: true,
    secure: config.secure,
    sameSite: 'lax',
    maxAge: 3600000,
    path: '/',
  });
  return csrf;
}
export function checkCsrf(req: Request, config: AuthConfig) {
  const expected: unknown = req.signedCookies?.tala_csrf;
  const body = req.body as Record<string, unknown> | undefined;
  const actual: unknown = req.get('x-csrf-token') || body?.csrf;
  if (
    typeof expected !== 'string' ||
    typeof actual !== 'string' ||
    !equal(expected, actual) ||
    (req.headers.origin && req.headers.origin !== config.issuer)
  )
    throw new ForbiddenException('Protection CSRF : recharge le formulaire.');
}
@Catch()
export class SafeErrors implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    if (response.headersSent) return;
    if (request.headers.accept?.includes('text/html')) {
      const status =
        exception instanceof ZodError
          ? 400
          : exception instanceof HttpException
            ? exception.getStatus()
            : 500;
      const message =
        exception instanceof ZodError
          ? 'Vérifiez les champs du formulaire.'
          : exception instanceof HttpException
            ? exception.message
            : 'Opération impossible. Réessayez plus tard.';
      return response
        .status(status)
        .type('html')
        .send(
          page(
            'Vérifions ensemble',
            `<p role="alert">${escape(message)}</p><a class="button" href="${escape(continuation(request))}">Revenir à la connexion</a><nav><a href="/register">Créer un compte</a><a href="/forgot-password">Mot de passe oublié</a></nav>`,
          ),
        );
    }
    if (exception instanceof ZodError)
      return response.status(400).json({
        message: 'Données invalides.',
        fields: exception.issues.map((i) => i.path.join('.')),
      });
    if (exception instanceof HttpException)
      return response
        .status(exception.getStatus())
        .json({ message: exception.message });
    if ((exception as { code?: string })?.code === 'P2002')
      return response
        .status(409)
        .json({ message: 'Informations indisponibles.' });
    return response
      .status(500)
      .json({ message: 'Opération impossible. Réessaie plus tard.' });
  }
}
